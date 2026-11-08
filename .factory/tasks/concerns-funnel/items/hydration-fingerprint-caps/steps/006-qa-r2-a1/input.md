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
  "slug": "hydration-fingerprint-caps",
  "kind": "dev",
  "title": "Unified hydration, caps, fingerprint",
  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
  "outlineRef": "hydration-fingerprint-caps",
  "milestone": "m1-hydration-prompts",
  "wave": 1,
  "scenarioRefs": [
    "m1-hydration-prompts:1",
    "m1-hydration-prompts:2",
    "m1-hydration-prompts:3",
    "m1-hydration-prompts:4",
    "m1-hydration-prompts:6",
    "m1-hydration-prompts:7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/fingerprint.ts:20-50",
    "plugins/software-factory/src/core/artifacts.ts:313-325"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..a228d4c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,57 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+        - plugins/software-factory/test/engine/reviewer-triage.test.ts
+        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 14 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
+      junitCaseCount: 15
+      junitCaseIds:
+        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+          min(diffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+          at min(inputBytes, 500) bytes
+        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+          at min(taskDiffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+          zero and tiny caps
+        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+          by diff bytes and lets caller-supplied values win
+        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+          bytes through the injected git function
+        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+          from concernsYaml without a duplicate concerns section
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+          pending resolutions for review
+        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+          close-ups but not for review
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+          terse remarkable records
+        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+          concerns only in the architect set
+        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+          remarkables
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+          and location without affects
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).unions affects without forking and
+          preserves terminal status
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+          the stable id
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..edfeb92
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,66 @@
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
+  "slug": "hydration-fingerprint-caps",
+  "kind": "dev",
+  "title": "Unified hydration, caps, fingerprint",
+  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+  "outlineRef": "hydration-fingerprint-caps",
+  "milestone": "m1-hydration-prompts",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-hydration-prompts:1",
+    "m1-hydration-prompts:2",
+    "m1-hydration-prompts:3",
+    "m1-hydration-prompts:4",
+    "m1-hydration-prompts:6",
+    "m1-hydration-prompts:7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/fingerprint.ts:20-50",
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
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..3392505
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:23:15.847Z
+session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+endedAt: 2026-11-08T19:38:59.292Z
+usage:
+  inputTokens: 190368
+  outputTokens: 67345
+  costUsd: 0.104286
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..bdc4fbc
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,103 @@
+status: ok
+summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
+  tests) covering the ADR contracts: step-role byte caps (review/qa
+  min(diff,2000), close-ups min(taskDiff,2000),
+  plan-review/architect/develop-family min(input,500)), '' semantics at
+  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
+  rule, close-up taskDiff via injectable gitFn, architect hydration from
+  concernsYaml without the removed duplicated '--- Concerns ---' section and
+  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
+  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
+  affects-free fingerprint identity, affects union without forking incl.
+  terminal status, and legacy affects-keyed rename-merge. Updated three existing
+  tests to the new contracts (fingerprint ignores affects; reviewer rendering
+  hydrates through the new API with a non-empty diff; architect routing tests
+  supply the concernsYaml placeholder that the prompt-fragments item will add).
+  Production code was left untouched; only test files changed. New production
+  API is looked up dynamically so red failures are assertion/runtime failures in
+  executed tests, not collection/import errors."
+target:
+  selectors:
+    - test/engine/hydration-fingerprint-caps.test.ts
+  expectRed:
+    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+      min(diffBytes, 2000) bytes
+    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+      min(inputBytes, 500) bytes
+    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+      min(taskDiffBytes, 2000) bytes
+    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+      and tiny caps
+    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+      diff bytes and lets caller-supplied values win
+    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+      bytes through the injected git function
+    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+      concernsYaml without a duplicate concerns section
+    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+      pending resolutions for review
+    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+      close-ups but not for review
+    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+      terse remarkable records
+    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+      concerns only in the architect set
+    - Concern identity and affects union
+      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+      location without affects
+    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+      affects without forking and preserves terminal status
+    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+      a legacy affects-keyed file to the stable id
+evidence:
+  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
+    compiles against current production; new options are passed through an
+    explicit any-cast only in tests)."
+  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
+    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
+    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
+    not on import/collection errors."
+  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
+    --reporter=junit` -> suite collected; all 14 declared node ids present with
+    status=fail (<failure>). Probe IDs match the runner's native
+    `classname.name` form.
+  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
+    fail (only the updated fingerprint test expecting affects-independent
+    identity); confirms the suite collects after the test edit."
+  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
+    fail (only the rewritten hydration-rendering test awaiting
+    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
+    review hydration is exercised."
+  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
+    pass / 2 fail as expected-red for the new architect set: seeded concerns are
+    routed, and the old open-only step-runner path cannot hydrate them without
+    the removed buildArchitectHydration concerns section."
+  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
+    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
+    hydration-fingerprint-caps.test.ts; no production files touched."
+concerns:
+  - The routing-architect-consult test now injects a minimal in-memory
+    architect-plan/architect-wave-report override containing {{concernsYaml}},
+    because builtin fragments gain that placeholder only in the separate
+    prompt-fragments item. The override should be removable once that item
+    lands.
+  - Tests access the not-yet-existing triage exports through a dynamic namespace
+    lookup so the suite collects and target-red failures are behavioral rather
+    than import errors; once green, the lookup can be replaced by direct named
+    imports.
+  - One non-declared test in the new file ('counts concerns only, never
+    remarkables') already passes because countConcerns is intentionally
+    unchanged by this item.
+notes: "Implementation plan for the green step is fully specified by the tests:
+  add
+  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
+  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
+  renderConcernsYaml with strict empty fallback; drop affects from
+  concernFingerprint, union affects (including terminal statuses) with an
+  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
+  scan with no GC; inject concernsYaml in step-runner only when caller
+  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
+  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
+  via git(parentBranch...HEAD) with an injectable gitFn; delete
+  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
+  without concerns."
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..410c83f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,113 @@
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
+        durationMs: 4842
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 86983
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+
+           399 pass
+           2 skip
+           0 fail
+           1893 expect() calls
+          Ran 401 tests across 66 files. [86.84s]
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
+        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
+      junitCaseCount: 15
+      junitCaseIds:
+        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+          min(diffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+          at min(inputBytes, 500) bytes
+        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+          at min(taskDiffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+          zero and tiny caps
+        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+          by diff bytes and lets caller-supplied values win
+        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+          bytes through the injected git function
+        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+          from concernsYaml without a duplicate concerns section
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+          pending resolutions for review
+        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+          close-ups but not for review
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+          terse remarkable records
+        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+          concerns only in the architect set
+        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+          remarkables
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+          and location without affects
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).unions affects without forking and
+          preserves terminal status
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+          the stable id
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 224/300 production lines changed"
+    details:
+      changedLines:
+        added: 163
+        deleted: 61
+        total: 224
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/triage.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..6bf3c27
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
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
+  "slug": "hydration-fingerprint-caps",
+  "kind": "dev",
+  "title": "Unified hydration, caps, fingerprint",
+  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+  "outlineRef": "hydration-fingerprint-caps",
+  "milestone": "m1-hydration-prompts",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-hydration-prompts:1",
+    "m1-hydration-prompts:2",
+    "m1-hydration-prompts:3",
+    "m1-hydration-prompts:4",
+    "m1-hydration-prompts:6",
+    "m1-hydration-prompts:7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/hydration-fingerprint-caps.test.ts"
+  ],
+  "expectRed": [
+    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
+    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
+    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
+    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
+    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
+    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
+    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
+    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
+    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
+    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
+    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
+    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
+    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
+    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/fingerprint.ts:20-50",
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
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..2468de3
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-08T19:39:01.204Z
+session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
+endedAt: 2026-11-08T19:48:44.187Z
+usage:
+  inputTokens: 104345
+  outputTokens: 31138
+  costUsd: 0.044819
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..f9624ec
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,69 @@
+status: ok
+summary: Implemented unified concern hydration with step-role byte caps,
+  hydrated concern sets, and affects-independent fingerprints with legacy
+  rename-merge. Triage now owns
+  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
+  injects concernsYaml only when the caller does not supply it, computing
+  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
+  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
+  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
+  deleted. Concerns merge now unions affects while preserving terminal status,
+  and aggregate migrates legacy affects-keyed files to stable ids. All target
+  tests, typecheck, and the full suite pass.
+target:
+  selectors:
+    - test/engine/hydration-fingerprint-caps.test.ts
+  expectRed:
+    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+      min(diffBytes, 2000) bytes
+    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+      min(inputBytes, 500) bytes
+    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+      min(taskDiffBytes, 2000) bytes
+    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+      and tiny caps
+    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+      diff bytes and lets caller-supplied values win
+    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+      bytes through the injected git function
+    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+      concernsYaml without a duplicate concerns section
+    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+      pending resolutions for review
+    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+      close-ups but not for review
+    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+      terse remarkable records
+    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+      concerns only in the architect set
+    - Concern identity and affects union
+      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+      location without affects
+    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+      affects without forking and preserves terminal status
+    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+      a legacy affects-keyed file to the stable id
+evidence:
+  - cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
+    expect() calls
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
+    fail, 401 tests across 66 files (95.78s)
+  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
+    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
+    deletions within prod budget
+  - Manual diff review confirmed hydrateConcernsYaml removed, no
+    prompt-fragment/router/epic/ingest changes, and architect hydration contains
+    no duplicate concerns section
+concerns:
+  - Legacy rename-merge intentionally treats the incoming detail as
+    authoritative when migrating a pre-union-fingerprint file, while ordinary
+    merges retain the longer stored detail per existing behavior.
+  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
+    fragment, so custom unregistered fragments with a hand-added placeholder
+    rely on caller-supplied concernsYaml.
+notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
+  computation; iteration passes parentBranch to wave and plan close-ups.
+  renderConcernsYaml now renders pre-shaped records and returns '' when no
+  record fits the cap.
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..1fe7b7c
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,53 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 14 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794167425243-3rnydh3yvvm.xml
+      junitCaseCount: 15
+      junitCaseIds:
+        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+          min(diffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+          at min(inputBytes, 500) bytes
+        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+          at min(taskDiffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+          zero and tiny caps
+        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+          by diff bytes and lets caller-supplied values win
+        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+          bytes through the injected git function
+        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+          from concernsYaml without a duplicate concerns section
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+          pending resolutions for review
+        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+          close-ups but not for review
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+          terse remarkable records
+        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+          concerns only in the architect set
+        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+          remarkables
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+          and location without affects
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).unions affects without forking and
+          preserves terminal status
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+          the stable id
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..83f6b95
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,2003 @@
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
+  "slug": "hydration-fingerprint-caps",
+  "kind": "dev",
+  "title": "Unified hydration, caps, fingerprint",
+  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+  "outlineRef": "hydration-fingerprint-caps",
+  "milestone": "m1-hydration-prompts",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-hydration-prompts:1",
+    "m1-hydration-prompts:2",
+    "m1-hydration-prompts:3",
+    "m1-hydration-prompts:4",
+    "m1-hydration-prompts:6",
+    "m1-hydration-prompts:7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..a228d4c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,57 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 14 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..edfeb92
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,66 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..3392505
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T19:23:15.847Z
++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++endedAt: 2026-11-08T19:38:59.292Z
++usage:
++  inputTokens: 190368
++  outputTokens: 67345
++  costUsd: 0.104286
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..bdc4fbc
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,103 @@
++status: ok
++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
++  tests) covering the ADR contracts: step-role byte caps (review/qa
++  min(diff,2000), close-ups min(taskDiff,2000),
++  plan-review/architect/develop-family min(input,500)), '' semantics at
++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
++  rule, close-up taskDiff via injectable gitFn, architect hydration from
++  concernsYaml without the removed duplicated '--- Concerns ---' section and
++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
++  affects-free fingerprint identity, affects union without forking incl.
++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
++  hydrates through the new API with a non-empty diff; architect routing tests
++  supply the concernsYaml placeholder that the prompt-fragments item will add).
++  Production code was left untouched; only test files changed. New production
++  API is looked up dynamically so red failures are assertion/runtime failures in
++  executed tests, not collection/import errors."
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
++    compiles against current production; new options are passed through an
++    explicit any-cast only in tests)."
++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
++    not on import/collection errors."
++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
++    --reporter=junit` -> suite collected; all 14 declared node ids present with
++    status=fail (<failure>). Probe IDs match the runner's native
++    `classname.name` form.
++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
++    fail (only the updated fingerprint test expecting affects-independent
++    identity); confirms the suite collects after the test edit."
++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
++    fail (only the rewritten hydration-rendering test awaiting
++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
++    review hydration is exercised."
++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
++    routed, and the old open-only step-runner path cannot hydrate them without
++    the removed buildArchitectHydration concerns section."
++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
++    hydration-fingerprint-caps.test.ts; no production files touched."
++concerns:
++  - The routing-architect-consult test now injects a minimal in-memory
++    architect-plan/architect-wave-report override containing {{concernsYaml}},
++    because builtin fragments gain that placeholder only in the separate
++    prompt-fragments item. The override should be removable once that item
++    lands.
++  - Tests access the not-yet-existing triage exports through a dynamic namespace
++    lookup so the suite collects and target-red failures are behavioral rather
++    than import errors; once green, the lookup can be replaced by direct named
++    imports.
++  - One non-declared test in the new file ('counts concerns only, never
++    remarkables') already passes because countConcerns is intentionally
++    unchanged by this item.
++notes: "Implementation plan for the green step is fully specified by the tests:
++  add
++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
++  renderConcernsYaml with strict empty fallback; drop affects from
++  concernFingerprint, union affects (including terminal statuses) with an
++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
++  scan with no GC; inject concernsYaml in step-runner only when caller
++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
++  via git(parentBranch...HEAD) with an injectable gitFn; delete
++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
++  without concerns."
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..410c83f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,113 @@
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
++        durationMs: 4842
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 86983
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
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
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++
++           399 pass
++           2 skip
++           0 fail
++           1893 expect() calls
++          Ran 401 tests across 66 files. [86.84s]
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
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 224/300 production lines changed"
++    details:
++      changedLines:
++        added: 163
++        deleted: 61
++        total: 224
++        files:
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/triage.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..6bf3c27
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,85 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/hydration-fingerprint-caps.test.ts"
++  ],
++  "expectRed": [
++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2468de3
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:39:01.204Z
++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
++endedAt: 2026-11-08T19:48:44.187Z
++usage:
++  inputTokens: 104345
++  outputTokens: 31138
++  costUsd: 0.044819
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..f9624ec
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,69 @@
++status: ok
++summary: Implemented unified concern hydration with step-role byte caps,
++  hydrated concern sets, and affects-independent fingerprints with legacy
++  rename-merge. Triage now owns
++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
++  injects concernsYaml only when the caller does not supply it, computing
++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
++  deleted. Concerns merge now unions affects while preserving terminal status,
++  and aggregate migrates legacy affects-keyed files to stable ids. All target
++  tests, typecheck, and the full suite pass.
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
++    expect() calls
++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
++    fail, 401 tests across 66 files (95.78s)
++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
++    deletions within prod budget
++  - Manual diff review confirmed hydrateConcernsYaml removed, no
++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
++    no duplicate concerns section
++concerns:
++  - Legacy rename-merge intentionally treats the incoming detail as
++    authoritative when migrating a pre-union-fingerprint file, while ordinary
++    merges retain the longer stored detail per existing behavior.
++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
++    fragment, so custom unregistered fragments with a hand-added placeholder
++    rely on caller-supplied concernsYaml.
++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
++  computation; iteration passes parentBranch to wave and plan close-ups.
++  renderConcernsYaml now renders pre-shaped records and returns '' when no
++  record fits the cap.
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index 5e2078d..197bc81 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
+ const hash = (prefix: string, parts: unknown[]) =>
+   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
+ 
+-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++/** Stable concern identity: kind, normalized summary, location. */
+ export function concernFingerprint(c: ConcernInput): string {
+-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
+ }
+ 
+ async function readExisting<T>(file: string): Promise<T | undefined> {
+@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
+   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+   const location = input.location ?? existing?.location;
+-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++  const affects = input.affects
++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
++    : existing?.affects;
+   return {
+     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+     summary: existing?.summary ?? input.summary.trim(), detail,
+@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
+   };
+ }
+ 
++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return undefined;
++    throw err;
++  }
++  const [file, line] = locationOf(input.location);
++  for (const name of names.sort()) {
++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
++    const candidate = path.join(dir, name);
++    try {
++      const record = await readYaml<StoredConcernArtifact>(candidate);
++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
++      const [rfile, rline] = locationOf(record.location);
++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
++      return { file: candidate, record };
++    } catch { /* Corrupt entries are not migration candidates. */ }
++  }
++  return undefined;
++}
++
+ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+ export async function aggregateConcerns(
+   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
+@@ -85,10 +110,17 @@ export async function aggregateConcerns(
+     const out: StoredConcernArtifact[] = [];
+     for (const input of concerns) {
+       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+-      const existing = await readExisting<StoredConcernArtifact>(file);
++      let existing = await readExisting<StoredConcernArtifact>(file);
++      let legacyFile: string | undefined;
++      if (!existing) {
++        const migrated = await legacyConcern(dir, input);
++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
++      }
+       const merged = mergeConcern(existing, input, ctx.source, at);
+-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+       await writeYamlAtomic(file, merged);
++      if (legacyFile) await fs.promises.unlink(legacyFile);
+       dirty = true; out.push(merged);
+     }
+     for (const decision of remarkables) {
+@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
+   }
+ }
+ 
+-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+-  const dir = dirOf(taskDir);
+-  let names: string[];
+-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+-    if (err?.code === "ENOENT") return "[]";
+-    throw err;
+-  }
+-  const items = await Promise.all(
+-    names
+-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+-      .map(async (name) => {
+-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+-      })
+-  );
+-  const open = items
+-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+-}
+-
+ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 84a77f6..0cc7f10 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+-  hydrateConcernsYaml,
+   listConcernIds,
+   listConcerns,
+   partitionSuggestions,
+ } from "../concerns.js";
+-import { renderConcernsYaml } from "../triage.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -169,23 +167,13 @@ async function buildArchitectHydration(
+     }
+   }
+ 
+-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+-  // every architect turn the terse decision context the act phase acts on.
+-  // Appended last so the byte cap never evicts it.
+-  const actionableConcerns = (await listConcerns(taskDir)).filter(
+-    (c) => c.status === "open" || c.status === "routed"
+-  );
+-  if (actionableConcerns.length > 0) {
+-    parts.push(
+-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+-    );
+-  }
+-
++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
+   const combined = parts.join("\n\n");
+-  if (combined.length <= maxBytes) {
+-    return combined;
+-  }
+-  return combined.slice(combined.length - maxBytes);
++  const buf = Buffer.from(combined, "utf8");
++  if (buf.length <= maxBytes) return combined;
++  let start = buf.length - maxBytes;
++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
++  return buf.subarray(start).toString("utf8");
+ }
+ 
+ /**
+@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     // Triage ids are those that existed before this review round; capturing
+     // them here mirrors the step-runner exact-id partition.
+     const knownConcernIds = await listConcernIds(taskDir);
+-    const concernsYaml = await hydrateConcernsYaml(taskDir);
+     // Check if review round record already exists
+     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+     const revStepRes = await runAgentStep({
+@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         plan: JSON.stringify(plan, null, 2),
+         intent: intentText,
+         context: contextYaml,
+-        concernsYaml,
+         limits: JSON.stringify(limits, null, 2),
+         dispositionsCriteria: formatDispositionsSection(
+           loadCriteriaBundle(pipeline.criteria).dispositions,
+@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         waveReport: waveSummary,
+         infra: infraYaml,
+       },
++      parentBranch,
+       turnsSemaphore,
+       budgetTracker,
+       iteration,
+@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       plan: JSON.stringify(plan, null, 2),
+       context: contextYaml,
+     },
++    parentBranch,
+     turnsSemaphore,
+     budgetTracker,
+     iteration,
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index 3b158c4..69fba68 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   aggregateConcerns,
+   applyCloseupResolutions,
+-  listOpenConcerns,
+ } from "../concerns.js";
+ import {
+   applyReviewTriage,
+-  renderConcernsYaml,
++  hydrateStepConcerns,
+   TriageValidationError,
+   type ReviewTriageOutcome,
+ } from "../triage.js";
++import { KNOWN_VARS } from "../prompt-vars.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -70,6 +70,8 @@ export interface StepRunOptions {
+   project: ProjectConfig;
+   prompts: any;
+   promptVars: Record<string, string>;
++  parentBranch?: string;
++  gitFn?: typeof git;
+   turnsSemaphore?: Semaphore;
+   customSchema?: JSONSchema;
+   log?: (msg: string) => void;
+@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+   const fragment = stepFragment ?? `steps/${stepId}`;
+   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+-  const openConcerns = await listOpenConcerns(taskDir);
+-  const concernsYaml = openConcerns.length > 0
+-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
+-    : "";
+   const effectivePromptVars: Record<string, string> = {
+     humanInvolvementCriteria: formatHumanInvolvementCriteria(
+       criteriaBundle.humanInvolvement,
+       pipeline.humanInvolvement
+     ),
+-    concernsYaml,
+     ...promptVars,
+   };
++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
++    const stepRole = fragment.replace(/^steps\//, "");
++    if (stepRole === "review" || stepRole === "qa") {
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
++      });
++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
++      });
++    } else {
++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
++      const inputBytes = knownVars
++        .filter((key) => !excluded.has(key))
++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
++    }
++  }
+   let promptText: string;
+   let agentDef: { body: string; tools: string[]; description: string };
+   try {
+diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
+index 923a9d1..479287e 100644
+--- a/plugins/software-factory/src/core/triage.ts
++++ b/plugins/software-factory/src/core/triage.ts
+@@ -1,7 +1,10 @@
++import fs from "node:fs";
++import path from "node:path";
+ import yaml from "yaml";
+ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+-import { applyConcernTriage } from "./concerns.js";
++import { applyConcernTriage, listConcerns } from "./concerns.js";
+ import type { Repo } from "./git/repo.js";
++import { readYaml } from "./records/io.js";
+ import { writeQuestion } from "./steer.js";
+ 
+ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
+@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
+     severity: c.severity,
+     summary: c.summary,
+     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
++    ...(c.status !== "open" ? { status: c.status } : {}),
++    ...(c.disposition ? { disposition: c.disposition } : {}),
++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
++    ...(c.source?.escalated ? { escalated: true } : {}),
+   };
+ }
+ 
++export interface HydrateStepConcernsRequest {
++  stepRole: string;
++  inputBytes?: number;
++  diffBytes?: number;
++  taskDiffBytes?: number;
++  consumer?: string;
++}
++
+ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+ const serialize = (records: Array<Record<string, unknown>>) =>
+   yaml.stringify(records, { lineWidth: 0 });
+ const truncateChars = (text: string, max: number) =>
+   Array.from(text).slice(0, max).join("");
+ 
++/** Normalizes step ids/fragments to their hydration role family. */
++function hydrationRole(stepRole: string): string {
++  const role = stepRole.replace(/^steps\//, "");
++  if (role === "architect" || role.startsWith("architect-")) return "architect";
++  if (role.startsWith("plan-review")) return "plan-review";
++  if (role.startsWith("plan-close-up")) return "plan-close-up";
++  if (role.startsWith("wave-close-up")) return "wave-close-up";
++  if (role === "review" || role === "qa") return role;
++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
++  return role;
++}
++
++function hydrationConsumer(role: string, consumer?: string): string {
++  if (consumer) return consumer;
++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
++  return role === "architect" ? "architect" : role;
++}
++
++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
++  const dir = path.join(taskDir, "concerns");
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
++    throw err;
++  }
++  const records = await Promise.all(
++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++    })
++  );
++  return records
++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
++}
++
++/** Hydrated concern set per consumer (adr-hydrated-sets). */
++export async function listHydratedConcerns(
++  taskDir: string,
++  consumer: string
++): Promise<Array<Record<string, unknown>>> {
++  const includeRouted = consumer === "closeup" || consumer === "architect";
++  const includeEscalated = consumer === "architect";
++  const concerns = (await listConcerns(taskDir)).filter((c) =>
++    c.status === "open" ||
++    (includeRouted && c.status === "routed") ||
++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
++  );
++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
++}
++
++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
++export async function hydrateStepConcerns(
++  taskDir: string,
++  request: HydrateStepConcernsRequest
++): Promise<string> {
++  const role = hydrationRole(request.stepRole);
++  const cap = role === "review" || role === "qa"
++    ? Math.min(request.diffBytes ?? 0, 2000)
++    : role === "wave-close-up" || role === "plan-close-up"
++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
++      : Math.min(request.inputBytes ?? 0, 500);
++  if (cap <= 0) return "";
++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
++}
++
+ /**
+- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
+- * Detail is dropped; over-budget output condenses summaries, drops affects,
+- * then sheds trailing entries until the UTF-8 byte ceiling is met.
++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
++ * condenses summaries, drops affects, then sheds trailing entries; empty output
++ * is returned when no record fits the ceiling.
+  */
+ export function renderConcernsYaml(
+-  concerns: StoredConcernArtifact[],
++  records: Array<Record<string, unknown>>,
+   maxBytes = 8000
+ ): string {
+-  const records = concerns.map(terseConcern);
++  if (maxBytes <= 0 || records.length === 0) return "";
+   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
+     { records },
+     { records: records.map(({ affects: _affects, ...rest }) => rest) },
+@@ -110,7 +194,7 @@ export function renderConcernsYaml(
+       if (utf8Bytes(text) <= maxBytes) return text;
+     }
+   }
+-  return serialize([]);
++  return "";
+ }
+ 
+ /**
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+index a1f0728..ff3f5e8 100644
+--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -317,7 +317,7 @@ describe("Concern store", () => {
+     });
+   }
+ 
+-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
+     const identity = {
+       kind: "risk" as const,
+       summary: "  Flaky   GATE ",
+@@ -339,7 +339,9 @@ describe("Concern store", () => {
+     expect(
+       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+     ).not.toBe(fp);
+-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
+   });
+ 
+   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+new file mode 100644
+index 0000000..d75dcb9
+--- /dev/null
++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+@@ -0,0 +1,839 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import os from "node:os";
++import { createHash } from "node:crypto";
++import yaml from "yaml";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runIteration } from "../../src/core/flows/iteration.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import {
++  aggregateConcerns,
++  applyConcernTriage,
++  concernFingerprint,
++  countConcerns,
++  listConcerns,
++} from "../../src/core/concerns.js";
++import * as triageModule from "../../src/core/triage.js";
++import type {
++  ConcernSource,
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
++ *
++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
++ * plan-review/architect/develop-family from their registered prompt input.
++ */
++
++const ORCH = ".factory";
++const TASK = "hydration-caps";
++const agentsDir = path.resolve(import.meta.dir, "../../agents");
++
++type Hydrate = (
++  taskDir: string,
++  request: {
++    stepRole: string;
++    inputBytes?: number;
++    diffBytes?: number;
++    taskDiffBytes?: number;
++    consumer?: string;
++  }
++) => Promise<string>;
++type ListHydrated = (
++  taskDir: string,
++  consumer: string
++) => Promise<Array<Record<string, any>>>;
++
++/**
++ * New triage exports are looked up dynamically so this file collects against the
++ * pre-implementation module and fails on behavior, not on a missing import.
++ */
++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
++  const mod = triageModule as unknown as {
++    hydrateStepConcerns?: Hydrate;
++    listHydratedConcerns?: ListHydrated;
++  };
++  const hydrate = mod.hydrateStepConcerns;
++  const list = mod.listHydratedConcerns;
++  if (!hydrate || !list) {
++    return {
++      hydrate: (() => {
++        throw new Error("hydrateStepConcerns is not implemented");
++      }) as unknown as Hydrate,
++      list: (() => {
++        throw new Error("listHydratedConcerns is not implemented");
++      }) as unknown as ListHydrated,
++    };
++  }
++  return { hydrate, list };
++}
++
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
++
++describe("Hydration caps (adr-hydration-single-cap)", () => {
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
++    tmpRepo.commit("add hydration caps task");
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
++        reviewer: { role: "alt-workhorse" },
++        qa: { role: "alt-workhorse" },
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++      limits: { maxPlanReviewRounds: 1 },
++    };
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  function concernsDir() {
++    return path.join(taskDir, "concerns");
++  }
++
++  function concernFiles(prefix = "c-") {
++    const dir = concernsDir();
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
++    const harness = new FakeHarness();
++    const label = `${TASK}/runs/review#a1`;
++    harness.scriptOutcome(label, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    harness.scriptOutcome(`${label}#relaunch`, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
++    return runAgentStep({
++      task: TASK,
++      stepId: "review",
++      stepFragment: "steps/review",
++      agent: "reviewer",
++      cwd: taskWt,
++      taskWt,
++      taskDir,
++      recordsDir: path.join(taskDir, "runs"),
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts: promptsFor,
++      promptVars,
++    }).then((result) => ({ result, harness }));
++  }
++
++  function promptOf(harness: FakeHarness): string {
++    const call = harness.calls.find((c) => c.type === "run");
++    if (!call || call.type !== "run") throw new Error("no agent run captured");
++    return call.run.prompt;
++  }
++
++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-aaaaaaaaaa",
++      kind: "risk",
++      summary: "Retry loop can spin",
++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
++      severity: "high",
++      affects: ["item-a"],
++    });
++    await writeConcern({
++      id: "c-bbbbbbbbbb",
++      kind: "blocker",
++      summary: "Missing adapter",
++      detail: "e".repeat(600),
++      severity: "medium",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-aaaaaaaaaa");
++    expect(hydrated).toContain("Retry loop can spin");
++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
++    expect(yaml.parse(hydrated)).toHaveLength(2);
++
++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
++    expect(small).toContain("c-");
++  });
++
++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
++    await writeConcern({
++      id: "c-cccccccccc",
++      kind: "tech-debt",
++      summary: "Plan duplicates the retry helper",
++      detail: "f".repeat(600),
++      severity: "medium",
++      affects: ["m1"],
++    });
++    await writeConcern({
++      id: "c-dddddddddd",
++      kind: "risk",
++      summary: "Milestone boundary depends on an unbuilt adapter",
++      detail: "g".repeat(600),
++      severity: "high",
++      affects: ["m1"],
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
++    expect(hydrated).toContain("c-cccccccccc");
++
++    // Iteration 2+ has merged code on the branch: classification still uses the
++    // registered prompt input, not a branch-state diff inference.
++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
++  });
++
++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-eeeeeeeeee",
++      kind: "tech-debt",
++      summary: "Shared helper duplicated in two modules",
++      detail: "h".repeat(3000),
++      severity: "medium",
++    });
++    await writeConcern({
++      id: "c-ffffffffff",
++      kind: "assumption",
++      summary: "Cache survives restart",
++      detail: "i".repeat(3000),
++      severity: "low",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-eeeeeeeeee");
++
++    const planCloseup = await hydrate(taskDir, {
++      stepRole: "plan-close-up",
++      taskDiffBytes: 5000,
++    });
++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
++  });
++
++  it("returns empty hydration for zero and tiny caps", async () => {
++    await writeConcern({
++      id: "c-1111111111",
++      kind: "risk",
++      summary: "Visible only when the cap allows bytes",
++      detail: "j".repeat(600),
++    });
++
++    const { hydrate } = hydrationApi();
++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(positive).not.toBe("");
++    expect(idLines(positive).length).toBeGreaterThan(0);
++
++    for (const cap of [0, 1, 3]) {
++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
++      expect(empty).toBe("");
++      expect(idLines(empty)).toEqual([]);
++    }
++  });
++
++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
++    const summary = "Retry loop can spin";
++    const cid = "c-2222222222";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary,
++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
++      severity: "high",
++      affects: ["item-a"],
++    });
++
++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
++    expect(promptOf(zero.harness)).not.toContain(cid);
++
++    const hydrated = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++    });
++    const prompt = promptOf(hydrated.harness);
++    expect(prompt).toContain(cid);
++    expect(prompt).toContain(summary);
++    expect(prompt).not.toContain("DETAIL_SENTINEL");
++
++    const supplied = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++      concernsYaml: "CALLER-CONCERNS: c-caller",
++    });
++    const suppliedPrompt = promptOf(supplied.harness);
++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
++    expect(suppliedPrompt).not.toContain(cid);
++  });
++
++  it("computes close-up task diff bytes through the injected git function", async () => {
++    const cid = "c-3333333333";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary: "Close-up concern",
++      detail: "l".repeat(400),
++      severity: "medium",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "wave-close-up.md"),
++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
++
++    const gitCalls: string[][] = [];
++    const gitFn = async (_cwd: string, args: string[]) => {
++      gitCalls.push(args);
++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
++    };
++    const harness = new FakeHarness();
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    try {
++      await runAgentStep({
++        task: TASK,
++        stepId: "wave-close-up-1-1",
++        stepFragment: "steps/wave-close-up",
++        agent: "wave-close-up",
++        cwd: taskWt,
++        taskWt,
++        taskDir,
++        parentBranch: "topic/demo",
++        recordsDir: path.join(taskDir, "runs"),
++        repo,
++        harness,
++        pipeline,
++        project,
++        prompts: closeupPrompts,
++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
++        gitFn,
++      } as any);
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
++    const prompt = promptOf(harness);
++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
++    expect(block).toContain(cid);
++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(block)).toBeLessThan(5000);
++  });
++
++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
++    const cid = "c-4444444444";
++    await writeConcern({
++      id: cid,
++      kind: "blocker",
++      summary: "Database schema migration is pending",
++      detail: "m".repeat(400),
++      severity: "high",
++      status: "routed",
++      disposition: "architect",
++      affects: ["seed"],
++    });
++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
++      id: "dec-1",
++      context: "task",
++      decision: "continue",
++      rationale: "漢".repeat(120),
++      timestamp: "2026-01-01T00:00:00.000Z",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "architect-plan.md"),
++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const architectPrompts = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrideDirs: [overridesDir],
++    });
++
++    const harness = new FakeHarness();
++    let architectPrompt = "";
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
++      architectPrompt = run.prompt;
++      return {
++        ok: true,
++        data: {
++          iteration: 1,
++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
++          itemOutlines: [],
++        },
++      };
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    try {
++      await runIteration({
++        task: TASK,
++        taskDir,
++        taskWt,
++        repo,
++        harness,
++        pipeline: {
++          ...pipeline,
++          limits: {
++            hydrationBytes: 20,
++            maxPlanReviewRounds: 1,
++            maxIterations: 3,
++            maxParallelItems: 2,
++            maxParallelTurns: 4,
++            maxStepAttempts: 3,
++            maxFixRounds: 3,
++          },
++        },
++        project,
++        prompts: architectPrompts,
++      });
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(architectPrompt).toContain(cid);
++    expect(occurrences(architectPrompt, cid)).toBe(1);
++    expect(architectPrompt).not.toContain("--- Concerns ---");
++
++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
++    expect(debt).not.toContain("\uFFFD");
++    expect(steering).not.toContain("\uFFFD");
++
++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
++    expect(concerns).toContain(cid);
++  });
++});
++
++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
++  let tmpRepo: TmpRepo;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  async function writeRemarkable(
++    id: string,
++    chosen: string,
++    overrides: Record<string, unknown> = {}
++  ) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
++      id,
++      chosen,
++      alternatives: ["Other"],
++      why: "w".repeat(300),
++      status: "open",
++      source: { record: "001-architect-plan-a1", agent: "architect" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    });
++  }
++
++  it("hydrates open concerns with pending resolutions for review", async () => {
++    const pending = {
++      action: "carry" as const,
++      note: "Needs an architect decision",
++      by: "wave-close-up",
++      at: "2026-01-02T00:00:00.000Z",
++    };
++    await writeConcern({
++      id: "c-5555555555",
++      summary: "Needs a decision",
++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
++      pendingResolution: pending,
++    });
++
++    const { list } = hydrationApi();
++    for (const consumer of ["review", "develop", "qa"]) {
++      const hydrated = await list(taskDir, consumer);
++      expect(hydrated).toHaveLength(1);
++      expect(hydrated[0]).toMatchObject({
++        id: "c-5555555555",
++        kind: "risk",
++        summary: "Needs a decision",
++        pendingResolution: pending,
++      });
++      expect(hydrated[0]).not.toHaveProperty("detail");
++    }
++  });
++
++  it("includes routed concerns for close-ups but not for review", async () => {
++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
++    await writeConcern({
++      id: "c-7777777777",
++      status: "routed",
++      disposition: "architect",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
++
++    const closeup = await list(taskDir, "closeup");
++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
++  });
++
++  it("hydrates open remarkables as terse remarkable records", async () => {
++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++  });
++
++  it("includes dismissed escalated concerns only in the architect set", async () => {
++    await writeConcern({
++      id: "c-9999999999",
++      status: "dismissed",
++      dismissReason: "not real",
++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
++      createdAt: "2026-01-01T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-ababababab",
++      status: "dismissed",
++      dismissReason: "quiet",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-acacacacac",
++      status: "open",
++      createdAt: "2026-01-03T00:00:00.000Z",
++    });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
++    expect(architect[0]).toMatchObject({
++      id: "c-9999999999",
++      status: "dismissed",
++      escalated: true,
++    });
++  });
++
++  it("counts concerns only, never remarkables", async () => {
++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
++
++    await writeConcern({ id: "c-adadadadad", status: "open" });
++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
++  });
++});
++
++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function source(record = "001-develop-a1"): ConcernSource {
++    return { record, agent: "developer" };
++  }
++
++  function concernFiles() {
++    const dir = path.join(taskDir, "concerns");
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
++  function legacyFingerprint(input: {
++    kind: string;
++    summary: string;
++    location?: { file: string; line?: number };
++    affects?: string[];
++  }): string {
++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
++    const parts = [
++      input.kind,
++      norm(input.summary),
++      input.location?.file.trim() ?? null,
++      input.location?.line ?? null,
++      affects,
++    ];
++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++  }
++
++  it("fingerprints kind, normalized summary, and location without affects", () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "  Flaky   GATE ",
++      location: { file: "src/core/example.ts", line: 7 },
++    };
++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
++
++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
++
++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
++    expect(
++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++    ).not.toBe(id);
++  });
++
++  it("unions affects without forking and preserves terminal status", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Flaky gate blocks merges",
++      location: { file: "src/core/merge.ts", line: 12 },
++    };
++    const id = concernFingerprint(identity);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source() },
++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    let stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${id}.yaml`)
++    );
++    expect(stored.affects).toEqual(["item-a", "item-b"]);
++    expect(stored.status).toBe("open");
++    expect(stored.detail).toBe("a much longer detail");
++    expect(stored.severity).toBe("high");
++    expect(stored.source.escalated).toBe(true);
++
++    await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
++      ],
++    });
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("003-review-a1") },
++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
++    expect(stored.status).toBe("dismissed");
++    expect(stored.dismissReason).toBe("covered by ADR-1");
++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
++    expect(stored.source.escalated).toBe(true);
++  });
++
++  it("renames a legacy affects-keyed file to the stable id", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Legacy concern",
++      location: { file: "src/legacy.ts", line: 4 },
++    };
++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
++    const stableId = concernFingerprint(identity);
++    expect(legacyId).not.toBe(stableId);
++
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
++      id: legacyId,
++      ...identity,
++      detail: "legacy detail",
++      severity: "medium",
++      status: "open",
++      affects: ["old"],
++      source: { record: "000-develop-a1", agent: "developer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++    expect(concernFiles()).toEqual([legacyId]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
++    );
++
++    expect(concernFiles()).toEqual([stableId]);
++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${stableId}.yaml`)
++    );
++    expect(stored.id).toBe(stableId);
++    expect(stored.affects).toEqual(["new", "old"]);
++    expect(stored.detail).toBe("new detail");
++    expect(stored.severity).toBe("high");
++
++    // Re-emitting with another affect keeps the same stable triage id.
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, affects: ["new", "third"] }]
++    );
++    expect(concernFiles()).toEqual([stableId]);
++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
++  });
++});
+diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+index fb7cc9b..df5eac8 100644
+--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+@@ -16,9 +16,9 @@ import {
+   concernMailboxId,
+   isDebtConcern,
+   partitionReviewSuggestions,
+-  renderConcernsYaml,
+   type ReviewTriageOutcome,
+ } from "../../src/core/triage.js";
++import * as triageModule from "../../src/core/triage.js";
+ import type {
+   PipelineConfig,
+   ProjectConfig,
+@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         assignment: "Review the item",
+         checks: "",
+         testDiff: "",
+-        diff: "",
++        diff: "d".repeat(3000),
+         dispositionsCriteria: "",
+       },
+     });
+@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+     expect(qa.fixRequired).toBe(false);
+   });
+ 
+-  it("renders condensing concern YAML without detail and within the byte cap", () => {
++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
+     const concerns = [
+       storedConcern({
+         id: "c-aaaaaaaaaa",
+@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         detail: "e".repeat(600),
+       }),
+     ];
+-
+-    const rendered = renderConcernsYaml(concerns);
++    for (const concern of concerns) await writeConcern(concern);
++
++    const hydrate = (
++      triageModule as unknown as {
++        hydrateStepConcerns?: (
++          taskDir: string,
++          request: { stepRole: string; diffBytes: number }
++        ) => Promise<string>;
++      }
++    ).hydrateStepConcerns;
++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
++
++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
+     const parsed = yaml.parse(rendered);
+     expect(Array.isArray(parsed)).toBe(true);
+     expect(parsed).toHaveLength(2);
+@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+       Buffer.byteLength(JSON.stringify(concerns), "utf8")
+     );
+ 
+-    const capped = renderConcernsYaml(concerns, 120);
++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
+     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
+     expect(capped).not.toContain("\uFFFD");
+   });
+diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+index 3eb7799..58961a9 100644
+--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
+     prompts = loadPromptLibrary({
+       builtinDir: path.resolve(import.meta.dir, "../../agents"),
+       overrideDirs: [],
++      // The single hydration source is concernsYaml; prompt fragments gain the
++      // placeholder in the prompt-fragments item, so this test supplies it here.
++      overrides: {
++        "steps/architect-plan":
++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
++        "steps/architect-wave-report":
++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
++      },
+     });
+   });
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
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..7956d3a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:50:25.163Z
+session: 01a1bcb6-5653-7033-b9b4-41d98dfceafa
+endedAt: 2026-11-08T20:56:01.718Z
+usage:
+  inputTokens: 190650
+  outputTokens: 100837
+  costUsd: 0.050218
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-50-28-691Z_01a1bcb6-5653-7033-b9b4-41d98dfceafa
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..8f93e33
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,38 @@
+status: approved
+summary: Verified caps, sets, fingerprint-union, legacy rename; gates green; no
+  test weakening
+suggestions:
+  - id: develop-family-dormant-injection
+    disposition: optional
+    summary: "Develop-family hydration dormant: KNOWN_VARS lacks concernsYaml so
+      step-runner never injects"
+    detail: hydrateStepConcerns maps develop/test-first/fix-round/etc to 500B
+      inputBytes branch, but step-runner gates on
+      knownVars.includes(concernsYaml) and KNOWN_VARS for develop-family has no
+      concernsYaml entry. Path is correct per current fragments (no placeholder
+      to fill) but unexercised end-to-end; coordinate with prompt-fragments item
+      to register placeholder plus KNOWN_VARS, or document as intentional.
+    location:
+      file: plugins/software-factory/src/core/flows/step-runner.ts
+      line: 306
+  - id: legacy-multi-fork-merge
+    disposition: optional
+    summary: Legacy migration merges first match only; additional pre-union forks
+      would persist
+    detail: legacyConcern returns first same kind+normSummary+location file; once
+      stable file exists the scan is skipped, so hypothetical multiple
+      affects-keyed forks for one identity leave duplicates. Spec says singular
+      rename-merge with no GC, so compliant; consider merging all matches or
+      documenting single-merge sufficiency.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 76
+  - id: test-dynamic-lookup-cleanup
+    disposition: optional
+    summary: Replace dynamic triage lookup with direct imports now implementation is
+      green
+    detail: New and updated tests access hydrateStepConcerns via dynamic namespace
+      cast to allow red-phase collection; now green, direct named imports would
+      simplify and catch signature drift at compile time. No behavior impact.
+    location:
+      file: plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md
new file mode 100644
index 0000000..87de7f5
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md
@@ -0,0 +1,4138 @@
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
+  "slug": "hydration-fingerprint-caps",
+  "kind": "dev",
+  "title": "Unified hydration, caps, fingerprint",
+  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+  "outlineRef": "hydration-fingerprint-caps",
+  "milestone": "m1-hydration-prompts",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-hydration-prompts:1",
+    "m1-hydration-prompts:2",
+    "m1-hydration-prompts:3",
+    "m1-hydration-prompts:4",
+    "m1-hydration-prompts:6",
+    "m1-hydration-prompts:7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..a228d4c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,57 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 14 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..edfeb92
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,66 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..3392505
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T19:23:15.847Z
++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++endedAt: 2026-11-08T19:38:59.292Z
++usage:
++  inputTokens: 190368
++  outputTokens: 67345
++  costUsd: 0.104286
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..bdc4fbc
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,103 @@
++status: ok
++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
++  tests) covering the ADR contracts: step-role byte caps (review/qa
++  min(diff,2000), close-ups min(taskDiff,2000),
++  plan-review/architect/develop-family min(input,500)), '' semantics at
++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
++  rule, close-up taskDiff via injectable gitFn, architect hydration from
++  concernsYaml without the removed duplicated '--- Concerns ---' section and
++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
++  affects-free fingerprint identity, affects union without forking incl.
++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
++  hydrates through the new API with a non-empty diff; architect routing tests
++  supply the concernsYaml placeholder that the prompt-fragments item will add).
++  Production code was left untouched; only test files changed. New production
++  API is looked up dynamically so red failures are assertion/runtime failures in
++  executed tests, not collection/import errors."
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
++    compiles against current production; new options are passed through an
++    explicit any-cast only in tests)."
++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
++    not on import/collection errors."
++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
++    --reporter=junit` -> suite collected; all 14 declared node ids present with
++    status=fail (<failure>). Probe IDs match the runner's native
++    `classname.name` form.
++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
++    fail (only the updated fingerprint test expecting affects-independent
++    identity); confirms the suite collects after the test edit."
++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
++    fail (only the rewritten hydration-rendering test awaiting
++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
++    review hydration is exercised."
++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
++    routed, and the old open-only step-runner path cannot hydrate them without
++    the removed buildArchitectHydration concerns section."
++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
++    hydration-fingerprint-caps.test.ts; no production files touched."
++concerns:
++  - The routing-architect-consult test now injects a minimal in-memory
++    architect-plan/architect-wave-report override containing {{concernsYaml}},
++    because builtin fragments gain that placeholder only in the separate
++    prompt-fragments item. The override should be removable once that item
++    lands.
++  - Tests access the not-yet-existing triage exports through a dynamic namespace
++    lookup so the suite collects and target-red failures are behavioral rather
++    than import errors; once green, the lookup can be replaced by direct named
++    imports.
++  - One non-declared test in the new file ('counts concerns only, never
++    remarkables') already passes because countConcerns is intentionally
++    unchanged by this item.
++notes: "Implementation plan for the green step is fully specified by the tests:
++  add
++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
++  renderConcernsYaml with strict empty fallback; drop affects from
++  concernFingerprint, union affects (including terminal statuses) with an
++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
++  scan with no GC; inject concernsYaml in step-runner only when caller
++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
++  via git(parentBranch...HEAD) with an injectable gitFn; delete
++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
++  without concerns."
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..410c83f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,113 @@
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
++        durationMs: 4842
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 86983
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
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
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++
++           399 pass
++           2 skip
++           0 fail
++           1893 expect() calls
++          Ran 401 tests across 66 files. [86.84s]
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
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 224/300 production lines changed"
++    details:
++      changedLines:
++        added: 163
++        deleted: 61
++        total: 224
++        files:
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/triage.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..6bf3c27
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,85 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/hydration-fingerprint-caps.test.ts"
++  ],
++  "expectRed": [
++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2468de3
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:39:01.204Z
++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
++endedAt: 2026-11-08T19:48:44.187Z
++usage:
++  inputTokens: 104345
++  outputTokens: 31138
++  costUsd: 0.044819
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..f9624ec
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,69 @@
++status: ok
++summary: Implemented unified concern hydration with step-role byte caps,
++  hydrated concern sets, and affects-independent fingerprints with legacy
++  rename-merge. Triage now owns
++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
++  injects concernsYaml only when the caller does not supply it, computing
++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
++  deleted. Concerns merge now unions affects while preserving terminal status,
++  and aggregate migrates legacy affects-keyed files to stable ids. All target
++  tests, typecheck, and the full suite pass.
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
++    expect() calls
++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
++    fail, 401 tests across 66 files (95.78s)
++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
++    deletions within prod budget
++  - Manual diff review confirmed hydrateConcernsYaml removed, no
++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
++    no duplicate concerns section
++concerns:
++  - Legacy rename-merge intentionally treats the incoming detail as
++    authoritative when migrating a pre-union-fingerprint file, while ordinary
++    merges retain the longer stored detail per existing behavior.
++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
++    fragment, so custom unregistered fragments with a hand-added placeholder
++    rely on caller-supplied concernsYaml.
++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
++  computation; iteration passes parentBranch to wave and plan close-ups.
++  renderConcernsYaml now renders pre-shaped records and returns '' when no
++  record fits the cap.
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..1fe7b7c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
+@@ -0,0 +1,53 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 14 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794167425243-3rnydh3yvvm.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..83f6b95
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
+@@ -0,0 +1,2003 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..a228d4c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,57 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
+++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 14 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..edfeb92
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,66 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..3392505
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:23:15.847Z
+++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+++endedAt: 2026-11-08T19:38:59.292Z
+++usage:
+++  inputTokens: 190368
+++  outputTokens: 67345
+++  costUsd: 0.104286
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..bdc4fbc
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,103 @@
+++status: ok
+++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
+++  tests) covering the ADR contracts: step-role byte caps (review/qa
+++  min(diff,2000), close-ups min(taskDiff,2000),
+++  plan-review/architect/develop-family min(input,500)), '' semantics at
+++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
+++  rule, close-up taskDiff via injectable gitFn, architect hydration from
+++  concernsYaml without the removed duplicated '--- Concerns ---' section and
+++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
+++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
+++  affects-free fingerprint identity, affects union without forking incl.
+++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
+++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
+++  hydrates through the new API with a non-empty diff; architect routing tests
+++  supply the concernsYaml placeholder that the prompt-fragments item will add).
+++  Production code was left untouched; only test files changed. New production
+++  API is looked up dynamically so red failures are assertion/runtime failures in
+++  executed tests, not collection/import errors."
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
+++    compiles against current production; new options are passed through an
+++    explicit any-cast only in tests)."
+++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
+++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
+++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
+++    not on import/collection errors."
+++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
+++    --reporter=junit` -> suite collected; all 14 declared node ids present with
+++    status=fail (<failure>). Probe IDs match the runner's native
+++    `classname.name` form.
+++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
+++    fail (only the updated fingerprint test expecting affects-independent
+++    identity); confirms the suite collects after the test edit."
+++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
+++    fail (only the rewritten hydration-rendering test awaiting
+++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
+++    review hydration is exercised."
+++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
+++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
+++    routed, and the old open-only step-runner path cannot hydrate them without
+++    the removed buildArchitectHydration concerns section."
+++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
+++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
+++    hydration-fingerprint-caps.test.ts; no production files touched."
+++concerns:
+++  - The routing-architect-consult test now injects a minimal in-memory
+++    architect-plan/architect-wave-report override containing {{concernsYaml}},
+++    because builtin fragments gain that placeholder only in the separate
+++    prompt-fragments item. The override should be removable once that item
+++    lands.
+++  - Tests access the not-yet-existing triage exports through a dynamic namespace
+++    lookup so the suite collects and target-red failures are behavioral rather
+++    than import errors; once green, the lookup can be replaced by direct named
+++    imports.
+++  - One non-declared test in the new file ('counts concerns only, never
+++    remarkables') already passes because countConcerns is intentionally
+++    unchanged by this item.
+++notes: "Implementation plan for the green step is fully specified by the tests:
+++  add
+++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
+++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
+++  renderConcernsYaml with strict empty fallback; drop affects from
+++  concernFingerprint, union affects (including terminal statuses) with an
+++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
+++  scan with no GC; inject concernsYaml in step-runner only when caller
+++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
+++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
+++  via git(parentBranch...HEAD) with an injectable gitFn; delete
+++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
+++  without concerns."
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..410c83f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,113 @@
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
+++        durationMs: 4842
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 86983
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+++          ----------------------------------------------------------------
+++          Blocking Questions:
+++            (none)
+++          ----------------------------------------------------------------
+++          Digest Questions:
+++            (none)
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++
+++           399 pass
+++           2 skip
+++           0 fail
+++           1893 expect() calls
+++          Ran 401 tests across 66 files. [86.84s]
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
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 224/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 163
+++        deleted: 61
+++        total: 224
+++        files:
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++          - plugins/software-factory/src/core/flows/step-runner.ts
+++          - plugins/software-factory/src/core/triage.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..6bf3c27
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,85 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/hydration-fingerprint-caps.test.ts"
+++  ],
+++  "expectRed": [
+++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
+++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
+++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
+++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
+++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
+++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..2468de3
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:39:01.204Z
+++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
+++endedAt: 2026-11-08T19:48:44.187Z
+++usage:
+++  inputTokens: 104345
+++  outputTokens: 31138
+++  costUsd: 0.044819
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..f9624ec
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,69 @@
+++status: ok
+++summary: Implemented unified concern hydration with step-role byte caps,
+++  hydrated concern sets, and affects-independent fingerprints with legacy
+++  rename-merge. Triage now owns
+++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
+++  injects concernsYaml only when the caller does not supply it, computing
+++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
+++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
+++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
+++  deleted. Concerns merge now unions affects while preserving terminal status,
+++  and aggregate migrates legacy affects-keyed files to stable ids. All target
+++  tests, typecheck, and the full suite pass.
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
+++    expect() calls
+++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
+++    fail, 401 tests across 66 files (95.78s)
+++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
+++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
+++    deletions within prod budget
+++  - Manual diff review confirmed hydrateConcernsYaml removed, no
+++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
+++    no duplicate concerns section
+++concerns:
+++  - Legacy rename-merge intentionally treats the incoming detail as
+++    authoritative when migrating a pre-union-fingerprint file, while ordinary
+++    merges retain the longer stored detail per existing behavior.
+++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
+++    fragment, so custom unregistered fragments with a hand-added placeholder
+++    rely on caller-supplied concernsYaml.
+++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
+++  computation; iteration passes parentBranch to wave and plan close-ups.
+++  renderConcernsYaml now renders pre-shaped records and returns '' when no
+++  record fits the cap.
++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
++index 5e2078d..197bc81 100644
++--- a/plugins/software-factory/src/core/concerns.ts
+++++ b/plugins/software-factory/src/core/concerns.ts
++@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
++ const hash = (prefix: string, parts: unknown[]) =>
++   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
++-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
++ 
++-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+++/** Stable concern identity: kind, normalized summary, location. */
++ export function concernFingerprint(c: ConcernInput): string {
++-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
++ }
++ 
++ async function readExisting<T>(file: string): Promise<T | undefined> {
++@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
++   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
++   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
++   const location = input.location ?? existing?.location;
++-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+++  const affects = input.affects
+++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
+++    : existing?.affects;
++   return {
++     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
++     summary: existing?.summary ?? input.summary.trim(), detail,
++@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
++   };
++ }
++ 
+++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
+++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT") return undefined;
+++    throw err;
+++  }
+++  const [file, line] = locationOf(input.location);
+++  for (const name of names.sort()) {
+++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
+++    const candidate = path.join(dir, name);
+++    try {
+++      const record = await readYaml<StoredConcernArtifact>(candidate);
+++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
+++      const [rfile, rline] = locationOf(record.location);
+++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
+++      return { file: candidate, record };
+++    } catch { /* Corrupt entries are not migration candidates. */ }
+++  }
+++  return undefined;
+++}
+++
++ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
++ export async function aggregateConcerns(
++   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
++@@ -85,10 +110,17 @@ export async function aggregateConcerns(
++     const out: StoredConcernArtifact[] = [];
++     for (const input of concerns) {
++       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
++-      const existing = await readExisting<StoredConcernArtifact>(file);
+++      let existing = await readExisting<StoredConcernArtifact>(file);
+++      let legacyFile: string | undefined;
+++      if (!existing) {
+++        const migrated = await legacyConcern(dir, input);
+++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
+++      }
++       const merged = mergeConcern(existing, input, ctx.source, at);
++-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
+++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++       await writeYamlAtomic(file, merged);
+++      if (legacyFile) await fs.promises.unlink(legacyFile);
++       dirty = true; out.push(merged);
++     }
++     for (const decision of remarkables) {
++@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
++   }
++ }
++ 
++-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
++-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
++-  const dir = dirOf(taskDir);
++-  let names: string[];
++-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++-    if (err?.code === "ENOENT") return "[]";
++-    throw err;
++-  }
++-  const items = await Promise.all(
++-    names
++-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
++-      .map(async (name) => {
++-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++-      })
++-  );
++-  const open = items
++-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
++-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
++-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
++-}
++-
++ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++   const updated = await locks.runExclusive(ctx.taskDir, async () => {
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index 84a77f6..0cc7f10 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++-  hydrateConcernsYaml,
++   listConcernIds,
++   listConcerns,
++   partitionSuggestions,
++ } from "../concerns.js";
++-import { renderConcernsYaml } from "../triage.js";
++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
++ import { validateEdits } from "../plan/limits.js";
++ import { applyEdits } from "../plan/apply.js";
++@@ -169,23 +167,13 @@ async function buildArchitectHydration(
++     }
++   }
++ 
++-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
++-  // every architect turn the terse decision context the act phase acts on.
++-  // Appended last so the byte cap never evicts it.
++-  const actionableConcerns = (await listConcerns(taskDir)).filter(
++-    (c) => c.status === "open" || c.status === "routed"
++-  );
++-  if (actionableConcerns.length > 0) {
++-    parts.push(
++-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
++-    );
++-  }
++-
+++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
++   const combined = parts.join("\n\n");
++-  if (combined.length <= maxBytes) {
++-    return combined;
++-  }
++-  return combined.slice(combined.length - maxBytes);
+++  const buf = Buffer.from(combined, "utf8");
+++  if (buf.length <= maxBytes) return combined;
+++  let start = buf.length - maxBytes;
+++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
+++  return buf.subarray(start).toString("utf8");
++ }
++ 
++ /**
++@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++     // Triage ids are those that existed before this review round; capturing
++     // them here mirrors the step-runner exact-id partition.
++     const knownConcernIds = await listConcernIds(taskDir);
++-    const concernsYaml = await hydrateConcernsYaml(taskDir);
++     // Check if review round record already exists
++     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
++     const revStepRes = await runAgentStep({
++@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         plan: JSON.stringify(plan, null, 2),
++         intent: intentText,
++         context: contextYaml,
++-        concernsYaml,
++         limits: JSON.stringify(limits, null, 2),
++         dispositionsCriteria: formatDispositionsSection(
++           loadCriteriaBundle(pipeline.criteria).dispositions,
++@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         waveReport: waveSummary,
++         infra: infraYaml,
++       },
+++      parentBranch,
++       turnsSemaphore,
++       budgetTracker,
++       iteration,
++@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++       plan: JSON.stringify(plan, null, 2),
++       context: contextYaml,
++     },
+++    parentBranch,
++     turnsSemaphore,
++     budgetTracker,
++     iteration,
++diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
++index 3b158c4..69fba68 100644
++--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++++ b/plugins/software-factory/src/core/flows/step-runner.ts
++@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++   aggregateConcerns,
++   applyCloseupResolutions,
++-  listOpenConcerns,
++ } from "../concerns.js";
++ import {
++   applyReviewTriage,
++-  renderConcernsYaml,
+++  hydrateStepConcerns,
++   TriageValidationError,
++   type ReviewTriageOutcome,
++ } from "../triage.js";
+++import { KNOWN_VARS } from "../prompt-vars.js";
++ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
++ import { captureHead, enforceHead } from "../git/guard.js";
++ import { commitAll } from "../git/commit.js";
++@@ -70,6 +70,8 @@ export interface StepRunOptions {
++   project: ProjectConfig;
++   prompts: any;
++   promptVars: Record<string, string>;
+++  parentBranch?: string;
+++  gitFn?: typeof git;
++   turnsSemaphore?: Semaphore;
++   customSchema?: JSONSchema;
++   log?: (msg: string) => void;
++@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
++   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
++   const fragment = stepFragment ?? `steps/${stepId}`;
++   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
++-  const openConcerns = await listOpenConcerns(taskDir);
++-  const concernsYaml = openConcerns.length > 0
++-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
++-    : "";
++   const effectivePromptVars: Record<string, string> = {
++     humanInvolvementCriteria: formatHumanInvolvementCriteria(
++       criteriaBundle.humanInvolvement,
++       pipeline.humanInvolvement
++     ),
++-    concernsYaml,
++     ...promptVars,
++   };
+++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
+++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
+++    const stepRole = fragment.replace(/^steps\//, "");
+++    if (stepRole === "review" || stepRole === "qa") {
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
+++      });
+++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
+++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
+++      });
+++    } else {
+++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
+++      const inputBytes = knownVars
+++        .filter((key) => !excluded.has(key))
+++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
+++    }
+++  }
++   let promptText: string;
++   let agentDef: { body: string; tools: string[]; description: string };
++   try {
++diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
++index 923a9d1..479287e 100644
++--- a/plugins/software-factory/src/core/triage.ts
+++++ b/plugins/software-factory/src/core/triage.ts
++@@ -1,7 +1,10 @@
+++import fs from "node:fs";
+++import path from "node:path";
++ import yaml from "yaml";
++ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++-import { applyConcernTriage } from "./concerns.js";
+++import { applyConcernTriage, listConcerns } from "./concerns.js";
++ import type { Repo } from "./git/repo.js";
+++import { readYaml } from "./records/io.js";
++ import { writeQuestion } from "./steer.js";
++ 
++ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
++@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
++     severity: c.severity,
++     summary: c.summary,
++     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
+++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
+++    ...(c.status !== "open" ? { status: c.status } : {}),
+++    ...(c.disposition ? { disposition: c.disposition } : {}),
+++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
+++    ...(c.source?.escalated ? { escalated: true } : {}),
++   };
++ }
++ 
+++export interface HydrateStepConcernsRequest {
+++  stepRole: string;
+++  inputBytes?: number;
+++  diffBytes?: number;
+++  taskDiffBytes?: number;
+++  consumer?: string;
+++}
+++
++ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++ const serialize = (records: Array<Record<string, unknown>>) =>
++   yaml.stringify(records, { lineWidth: 0 });
++ const truncateChars = (text: string, max: number) =>
++   Array.from(text).slice(0, max).join("");
++ 
+++/** Normalizes step ids/fragments to their hydration role family. */
+++function hydrationRole(stepRole: string): string {
+++  const role = stepRole.replace(/^steps\//, "");
+++  if (role === "architect" || role.startsWith("architect-")) return "architect";
+++  if (role.startsWith("plan-review")) return "plan-review";
+++  if (role.startsWith("plan-close-up")) return "plan-close-up";
+++  if (role.startsWith("wave-close-up")) return "wave-close-up";
+++  if (role === "review" || role === "qa") return role;
+++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
+++  return role;
+++}
+++
+++function hydrationConsumer(role: string, consumer?: string): string {
+++  if (consumer) return consumer;
+++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
+++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
+++  return role === "architect" ? "architect" : role;
+++}
+++
+++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
+++  const dir = path.join(taskDir, "concerns");
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
+++    throw err;
+++  }
+++  const records = await Promise.all(
+++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
+++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+++    })
+++  );
+++  return records
+++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
+++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
+++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
+++}
+++
+++/** Hydrated concern set per consumer (adr-hydrated-sets). */
+++export async function listHydratedConcerns(
+++  taskDir: string,
+++  consumer: string
+++): Promise<Array<Record<string, unknown>>> {
+++  const includeRouted = consumer === "closeup" || consumer === "architect";
+++  const includeEscalated = consumer === "architect";
+++  const concerns = (await listConcerns(taskDir)).filter((c) =>
+++    c.status === "open" ||
+++    (includeRouted && c.status === "routed") ||
+++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
+++  );
+++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
+++}
+++
+++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
+++export async function hydrateStepConcerns(
+++  taskDir: string,
+++  request: HydrateStepConcernsRequest
+++): Promise<string> {
+++  const role = hydrationRole(request.stepRole);
+++  const cap = role === "review" || role === "qa"
+++    ? Math.min(request.diffBytes ?? 0, 2000)
+++    : role === "wave-close-up" || role === "plan-close-up"
+++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
+++      : Math.min(request.inputBytes ?? 0, 500);
+++  if (cap <= 0) return "";
+++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
+++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
+++}
+++
++ /**
++- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
++- * Detail is dropped; over-budget output condenses summaries, drops affects,
++- * then sheds trailing entries until the UTF-8 byte ceiling is met.
+++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
+++ * condenses summaries, drops affects, then sheds trailing entries; empty output
+++ * is returned when no record fits the ceiling.
++  */
++ export function renderConcernsYaml(
++-  concerns: StoredConcernArtifact[],
+++  records: Array<Record<string, unknown>>,
++   maxBytes = 8000
++ ): string {
++-  const records = concerns.map(terseConcern);
+++  if (maxBytes <= 0 || records.length === 0) return "";
++   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
++     { records },
++     { records: records.map(({ affects: _affects, ...rest }) => rest) },
++@@ -110,7 +194,7 @@ export function renderConcernsYaml(
++       if (utf8Bytes(text) <= maxBytes) return text;
++     }
++   }
++-  return serialize([]);
+++  return "";
++ }
++ 
++ /**
++diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++index a1f0728..ff3f5e8 100644
++--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++@@ -317,7 +317,7 @@ describe("Concern store", () => {
++     });
++   }
++ 
++-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
++     const identity = {
++       kind: "risk" as const,
++       summary: "  Flaky   GATE ",
++@@ -339,7 +339,9 @@ describe("Concern store", () => {
++     expect(
++       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++     ).not.toBe(fp);
++-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
++   });
++ 
++   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
++diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++new file mode 100644
++index 0000000..d75dcb9
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++@@ -0,0 +1,839 @@
+++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+++import fs from "node:fs";
+++import path from "node:path";
+++import os from "node:os";
+++import { createHash } from "node:crypto";
+++import yaml from "yaml";
+++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+++import { runAgentStep } from "../../src/core/flows/step-runner.js";
+++import { runIteration } from "../../src/core/flows/iteration.js";
+++import { Repo } from "../../src/core/git/repo.js";
+++import { loadPromptLibrary } from "../../src/core/prompts.js";
+++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+++import {
+++  aggregateConcerns,
+++  applyConcernTriage,
+++  concernFingerprint,
+++  countConcerns,
+++  listConcerns,
+++} from "../../src/core/concerns.js";
+++import * as triageModule from "../../src/core/triage.js";
+++import type {
+++  ConcernSource,
+++  PipelineConfig,
+++  ProjectConfig,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
+++
+++/**
+++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
+++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
+++ *
+++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
+++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
+++ * plan-review/architect/develop-family from their registered prompt input.
+++ */
+++
+++const ORCH = ".factory";
+++const TASK = "hydration-caps";
+++const agentsDir = path.resolve(import.meta.dir, "../../agents");
+++
+++type Hydrate = (
+++  taskDir: string,
+++  request: {
+++    stepRole: string;
+++    inputBytes?: number;
+++    diffBytes?: number;
+++    taskDiffBytes?: number;
+++    consumer?: string;
+++  }
+++) => Promise<string>;
+++type ListHydrated = (
+++  taskDir: string,
+++  consumer: string
+++) => Promise<Array<Record<string, any>>>;
+++
+++/**
+++ * New triage exports are looked up dynamically so this file collects against the
+++ * pre-implementation module and fails on behavior, not on a missing import.
+++ */
+++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
+++  const mod = triageModule as unknown as {
+++    hydrateStepConcerns?: Hydrate;
+++    listHydratedConcerns?: ListHydrated;
+++  };
+++  const hydrate = mod.hydrateStepConcerns;
+++  const list = mod.listHydratedConcerns;
+++  if (!hydrate || !list) {
+++    return {
+++      hydrate: (() => {
+++        throw new Error("hydrateStepConcerns is not implemented");
+++      }) as unknown as Hydrate,
+++      list: (() => {
+++        throw new Error("listHydratedConcerns is not implemented");
+++      }) as unknown as ListHydrated,
+++    };
+++  }
+++  return { hydrate, list };
+++}
+++
+++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
+++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
+++
+++describe("Hydration caps (adr-hydration-single-cap)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
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
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
+++    tmpRepo.commit("add hydration caps task");
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
+++        developer: { role: "workhorse" },
+++        reviewer: { role: "alt-workhorse" },
+++        qa: { role: "alt-workhorse" },
+++        architect: { role: "architect" },
+++        "plan-reviewer": { role: "alt-architect" },
+++        pm: { role: "alt-workhorse" },
+++        "wave-close-up": { role: "alt-workhorse" },
+++        "plan-close-up": { role: "alt-workhorse" },
+++      },
+++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+++      limits: { maxPlanReviewRounds: 1 },
+++    };
+++    project = { orchestrationFolder: ORCH, worktreeRoot };
+++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  function concernsDir() {
+++    return path.join(taskDir, "concerns");
+++  }
+++
+++  function concernFiles(prefix = "c-") {
+++    const dir = concernsDir();
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
+++    const harness = new FakeHarness();
+++    const label = `${TASK}/runs/review#a1`;
+++    harness.scriptOutcome(label, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${label}#relaunch`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
+++    return runAgentStep({
+++      task: TASK,
+++      stepId: "review",
+++      stepFragment: "steps/review",
+++      agent: "reviewer",
+++      cwd: taskWt,
+++      taskWt,
+++      taskDir,
+++      recordsDir: path.join(taskDir, "runs"),
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts: promptsFor,
+++      promptVars,
+++    }).then((result) => ({ result, harness }));
+++  }
+++
+++  function promptOf(harness: FakeHarness): string {
+++    const call = harness.calls.find((c) => c.type === "run");
+++    if (!call || call.type !== "run") throw new Error("no agent run captured");
+++    return call.run.prompt;
+++  }
+++
+++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-aaaaaaaaaa",
+++      kind: "risk",
+++      summary: "Retry loop can spin",
+++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++    await writeConcern({
+++      id: "c-bbbbbbbbbb",
+++      kind: "blocker",
+++      summary: "Missing adapter",
+++      detail: "e".repeat(600),
+++      severity: "medium",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-aaaaaaaaaa");
+++    expect(hydrated).toContain("Retry loop can spin");
+++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
+++    expect(yaml.parse(hydrated)).toHaveLength(2);
+++
+++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
+++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
+++    expect(small).toContain("c-");
+++  });
+++
+++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
+++    await writeConcern({
+++      id: "c-cccccccccc",
+++      kind: "tech-debt",
+++      summary: "Plan duplicates the retry helper",
+++      detail: "f".repeat(600),
+++      severity: "medium",
+++      affects: ["m1"],
+++    });
+++    await writeConcern({
+++      id: "c-dddddddddd",
+++      kind: "risk",
+++      summary: "Milestone boundary depends on an unbuilt adapter",
+++      detail: "g".repeat(600),
+++      severity: "high",
+++      affects: ["m1"],
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
+++    expect(hydrated).toContain("c-cccccccccc");
+++
+++    // Iteration 2+ has merged code on the branch: classification still uses the
+++    // registered prompt input, not a branch-state diff inference.
+++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
+++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
+++  });
+++
+++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-eeeeeeeeee",
+++      kind: "tech-debt",
+++      summary: "Shared helper duplicated in two modules",
+++      detail: "h".repeat(3000),
+++      severity: "medium",
+++    });
+++    await writeConcern({
+++      id: "c-ffffffffff",
+++      kind: "assumption",
+++      summary: "Cache survives restart",
+++      detail: "i".repeat(3000),
+++      severity: "low",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-eeeeeeeeee");
+++
+++    const planCloseup = await hydrate(taskDir, {
+++      stepRole: "plan-close-up",
+++      taskDiffBytes: 5000,
+++    });
+++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
+++  });
+++
+++  it("returns empty hydration for zero and tiny caps", async () => {
+++    await writeConcern({
+++      id: "c-1111111111",
+++      kind: "risk",
+++      summary: "Visible only when the cap allows bytes",
+++      detail: "j".repeat(600),
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(positive).not.toBe("");
+++    expect(idLines(positive).length).toBeGreaterThan(0);
+++
+++    for (const cap of [0, 1, 3]) {
+++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
+++      expect(empty).toBe("");
+++      expect(idLines(empty)).toEqual([]);
+++    }
+++  });
+++
+++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
+++    const summary = "Retry loop can spin";
+++    const cid = "c-2222222222";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary,
+++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++
+++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
+++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
+++    expect(promptOf(zero.harness)).not.toContain(cid);
+++
+++    const hydrated = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++    });
+++    const prompt = promptOf(hydrated.harness);
+++    expect(prompt).toContain(cid);
+++    expect(prompt).toContain(summary);
+++    expect(prompt).not.toContain("DETAIL_SENTINEL");
+++
+++    const supplied = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++      concernsYaml: "CALLER-CONCERNS: c-caller",
+++    });
+++    const suppliedPrompt = promptOf(supplied.harness);
+++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
+++    expect(suppliedPrompt).not.toContain(cid);
+++  });
+++
+++  it("computes close-up task diff bytes through the injected git function", async () => {
+++    const cid = "c-3333333333";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary: "Close-up concern",
+++      detail: "l".repeat(400),
+++      severity: "medium",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "wave-close-up.md"),
+++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
+++
+++    const gitCalls: string[][] = [];
+++    const gitFn = async (_cwd: string, args: string[]) => {
+++      gitCalls.push(args);
+++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
+++    };
+++    const harness = new FakeHarness();
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    try {
+++      await runAgentStep({
+++        task: TASK,
+++        stepId: "wave-close-up-1-1",
+++        stepFragment: "steps/wave-close-up",
+++        agent: "wave-close-up",
+++        cwd: taskWt,
+++        taskWt,
+++        taskDir,
+++        parentBranch: "topic/demo",
+++        recordsDir: path.join(taskDir, "runs"),
+++        repo,
+++        harness,
+++        pipeline,
+++        project,
+++        prompts: closeupPrompts,
+++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
+++        gitFn,
+++      } as any);
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
+++    const prompt = promptOf(harness);
+++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
+++    expect(block).toContain(cid);
+++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(block)).toBeLessThan(5000);
+++  });
+++
+++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
+++    const cid = "c-4444444444";
+++    await writeConcern({
+++      id: cid,
+++      kind: "blocker",
+++      summary: "Database schema migration is pending",
+++      detail: "m".repeat(400),
+++      severity: "high",
+++      status: "routed",
+++      disposition: "architect",
+++      affects: ["seed"],
+++    });
+++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
+++      id: "dec-1",
+++      context: "task",
+++      decision: "continue",
+++      rationale: "漢".repeat(120),
+++      timestamp: "2026-01-01T00:00:00.000Z",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "architect-plan.md"),
+++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const architectPrompts = loadPromptLibrary({
+++      builtinDir: agentsDir,
+++      overrideDirs: [overridesDir],
+++    });
+++
+++    const harness = new FakeHarness();
+++    let architectPrompt = "";
+++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
+++      architectPrompt = run.prompt;
+++      return {
+++        ok: true,
+++        data: {
+++          iteration: 1,
+++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
+++          itemOutlines: [],
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    try {
+++      await runIteration({
+++        task: TASK,
+++        taskDir,
+++        taskWt,
+++        repo,
+++        harness,
+++        pipeline: {
+++          ...pipeline,
+++          limits: {
+++            hydrationBytes: 20,
+++            maxPlanReviewRounds: 1,
+++            maxIterations: 3,
+++            maxParallelItems: 2,
+++            maxParallelTurns: 4,
+++            maxStepAttempts: 3,
+++            maxFixRounds: 3,
+++          },
+++        },
+++        project,
+++        prompts: architectPrompts,
+++      });
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(architectPrompt).toContain(cid);
+++    expect(occurrences(architectPrompt, cid)).toBe(1);
+++    expect(architectPrompt).not.toContain("--- Concerns ---");
+++
+++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
+++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
+++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
+++    expect(debt).not.toContain("\uFFFD");
+++    expect(steering).not.toContain("\uFFFD");
+++
+++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
+++    expect(concerns).toContain(cid);
+++  });
+++});
+++
+++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
+++  let tmpRepo: TmpRepo;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  async function writeRemarkable(
+++    id: string,
+++    chosen: string,
+++    overrides: Record<string, unknown> = {}
+++  ) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
+++      id,
+++      chosen,
+++      alternatives: ["Other"],
+++      why: "w".repeat(300),
+++      status: "open",
+++      source: { record: "001-architect-plan-a1", agent: "architect" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    });
+++  }
+++
+++  it("hydrates open concerns with pending resolutions for review", async () => {
+++    const pending = {
+++      action: "carry" as const,
+++      note: "Needs an architect decision",
+++      by: "wave-close-up",
+++      at: "2026-01-02T00:00:00.000Z",
+++    };
+++    await writeConcern({
+++      id: "c-5555555555",
+++      summary: "Needs a decision",
+++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
+++      pendingResolution: pending,
+++    });
+++
+++    const { list } = hydrationApi();
+++    for (const consumer of ["review", "develop", "qa"]) {
+++      const hydrated = await list(taskDir, consumer);
+++      expect(hydrated).toHaveLength(1);
+++      expect(hydrated[0]).toMatchObject({
+++        id: "c-5555555555",
+++        kind: "risk",
+++        summary: "Needs a decision",
+++        pendingResolution: pending,
+++      });
+++      expect(hydrated[0]).not.toHaveProperty("detail");
+++    }
+++  });
+++
+++  it("includes routed concerns for close-ups but not for review", async () => {
+++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
+++    await writeConcern({
+++      id: "c-7777777777",
+++      status: "routed",
+++      disposition: "architect",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
+++
+++    const closeup = await list(taskDir, "closeup");
+++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
+++  });
+++
+++  it("hydrates open remarkables as terse remarkable records", async () => {
+++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
+++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++  });
+++
+++  it("includes dismissed escalated concerns only in the architect set", async () => {
+++    await writeConcern({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      dismissReason: "not real",
+++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-ababababab",
+++      status: "dismissed",
+++      dismissReason: "quiet",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-acacacacac",
+++      status: "open",
+++      createdAt: "2026-01-03T00:00:00.000Z",
+++    });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
+++    expect(architect[0]).toMatchObject({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      escalated: true,
+++    });
+++  });
+++
+++  it("counts concerns only, never remarkables", async () => {
+++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
+++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
+++
+++    await writeConcern({ id: "c-adadadadad", status: "open" });
+++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
+++  });
+++});
+++
+++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
+++    taskWt = tmpRepo.dir;
+++    taskDir = path.join(taskWt, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function source(record = "001-develop-a1"): ConcernSource {
+++    return { record, agent: "developer" };
+++  }
+++
+++  function concernFiles() {
+++    const dir = path.join(taskDir, "concerns");
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
+++  function legacyFingerprint(input: {
+++    kind: string;
+++    summary: string;
+++    location?: { file: string; line?: number };
+++    affects?: string[];
+++  }): string {
+++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
+++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
+++    const parts = [
+++      input.kind,
+++      norm(input.summary),
+++      input.location?.file.trim() ?? null,
+++      input.location?.line ?? null,
+++      affects,
+++    ];
+++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+++  }
+++
+++  it("fingerprints kind, normalized summary, and location without affects", () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "  Flaky   GATE ",
+++      location: { file: "src/core/example.ts", line: 7 },
+++    };
+++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
+++
+++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
+++
+++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
+++    expect(
+++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+++    ).not.toBe(id);
+++  });
+++
+++  it("unions affects without forking and preserves terminal status", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Flaky gate blocks merges",
+++      location: { file: "src/core/merge.ts", line: 12 },
+++    };
+++    const id = concernFingerprint(identity);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source() },
+++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    let stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${id}.yaml`)
+++    );
+++    expect(stored.affects).toEqual(["item-a", "item-b"]);
+++    expect(stored.status).toBe("open");
+++    expect(stored.detail).toBe("a much longer detail");
+++    expect(stored.severity).toBe("high");
+++    expect(stored.source.escalated).toBe(true);
+++
+++    await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [
+++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
+++      ],
+++    });
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("003-review-a1") },
+++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
+++    expect(stored.status).toBe("dismissed");
+++    expect(stored.dismissReason).toBe("covered by ADR-1");
+++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
+++    expect(stored.source.escalated).toBe(true);
+++  });
+++
+++  it("renames a legacy affects-keyed file to the stable id", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Legacy concern",
+++      location: { file: "src/legacy.ts", line: 4 },
+++    };
+++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
+++    const stableId = concernFingerprint(identity);
+++    expect(legacyId).not.toBe(stableId);
+++
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
+++      id: legacyId,
+++      ...identity,
+++      detail: "legacy detail",
+++      severity: "medium",
+++      status: "open",
+++      affects: ["old"],
+++      source: { record: "000-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    expect(concernFiles()).toEqual([legacyId]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
+++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
+++    );
+++
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${stableId}.yaml`)
+++    );
+++    expect(stored.id).toBe(stableId);
+++    expect(stored.affects).toEqual(["new", "old"]);
+++    expect(stored.detail).toBe("new detail");
+++    expect(stored.severity).toBe("high");
+++
+++    // Re-emitting with another affect keeps the same stable triage id.
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, affects: ["new", "third"] }]
+++    );
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
+++  });
+++});
++diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++index fb7cc9b..df5eac8 100644
++--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++@@ -16,9 +16,9 @@ import {
++   concernMailboxId,
++   isDebtConcern,
++   partitionReviewSuggestions,
++-  renderConcernsYaml,
++   type ReviewTriageOutcome,
++ } from "../../src/core/triage.js";
+++import * as triageModule from "../../src/core/triage.js";
++ import type {
++   PipelineConfig,
++   ProjectConfig,
++@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         assignment: "Review the item",
++         checks: "",
++         testDiff: "",
++-        diff: "",
+++        diff: "d".repeat(3000),
++         dispositionsCriteria: "",
++       },
++     });
++@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++     expect(qa.fixRequired).toBe(false);
++   });
++ 
++-  it("renders condensing concern YAML without detail and within the byte cap", () => {
+++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
++     const concerns = [
++       storedConcern({
++         id: "c-aaaaaaaaaa",
++@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         detail: "e".repeat(600),
++       }),
++     ];
++-
++-    const rendered = renderConcernsYaml(concerns);
+++    for (const concern of concerns) await writeConcern(concern);
+++
+++    const hydrate = (
+++      triageModule as unknown as {
+++        hydrateStepConcerns?: (
+++          taskDir: string,
+++          request: { stepRole: string; diffBytes: number }
+++        ) => Promise<string>;
+++      }
+++    ).hydrateStepConcerns;
+++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
+++
+++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
++     const parsed = yaml.parse(rendered);
++     expect(Array.isArray(parsed)).toBe(true);
++     expect(parsed).toHaveLength(2);
++@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++       Buffer.byteLength(JSON.stringify(concerns), "utf8")
++     );
++ 
++-    const capped = renderConcernsYaml(concerns, 120);
+++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
++     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
++     expect(capped).not.toContain("\uFFFD");
++   });
++diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++index 3eb7799..58961a9 100644
++--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
++     prompts = loadPromptLibrary({
++       builtinDir: path.resolve(import.meta.dir, "../../agents"),
++       overrideDirs: [],
+++      // The single hydration source is concernsYaml; prompt fragments gain the
+++      // placeholder in the prompt-fragments item, so this test supplies it here.
+++      overrides: {
+++        "steps/architect-plan":
+++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
+++        "steps/architect-wave-report":
+++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
+++      },
++     });
++   });
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..7956d3a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:50:25.163Z
++session: 01a1bcb6-5653-7033-b9b4-41d98dfceafa
++endedAt: 2026-11-08T20:56:01.718Z
++usage:
++  inputTokens: 190650
++  outputTokens: 100837
++  costUsd: 0.050218
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-50-28-691Z_01a1bcb6-5653-7033-b9b4-41d98dfceafa
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..8f93e33
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
+@@ -0,0 +1,38 @@
++status: approved
++summary: Verified caps, sets, fingerprint-union, legacy rename; gates green; no
++  test weakening
++suggestions:
++  - id: develop-family-dormant-injection
++    disposition: optional
++    summary: "Develop-family hydration dormant: KNOWN_VARS lacks concernsYaml so
++      step-runner never injects"
++    detail: hydrateStepConcerns maps develop/test-first/fix-round/etc to 500B
++      inputBytes branch, but step-runner gates on
++      knownVars.includes(concernsYaml) and KNOWN_VARS for develop-family has no
++      concernsYaml entry. Path is correct per current fragments (no placeholder
++      to fill) but unexercised end-to-end; coordinate with prompt-fragments item
++      to register placeholder plus KNOWN_VARS, or document as intentional.
++    location:
++      file: plugins/software-factory/src/core/flows/step-runner.ts
++      line: 306
++  - id: legacy-multi-fork-merge
++    disposition: optional
++    summary: Legacy migration merges first match only; additional pre-union forks
++      would persist
++    detail: legacyConcern returns first same kind+normSummary+location file; once
++      stable file exists the scan is skipped, so hypothetical multiple
++      affects-keyed forks for one identity leave duplicates. Spec says singular
++      rename-merge with no GC, so compliant; consider merging all matches or
++      documenting single-merge sufficiency.
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 76
++  - id: test-dynamic-lookup-cleanup
++    disposition: optional
++    summary: Replace dynamic triage lookup with direct imports now implementation is
++      green
++    detail: New and updated tests access hydrateStepConcerns via dynamic namespace
++      cast to allow red-phase collection; now green, direct named imports would
++      simplify and catch signature drift at compile time. No behavior impact.
++    location:
++      file: plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index 5e2078d..197bc81 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
+ const hash = (prefix: string, parts: unknown[]) =>
+   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
+ 
+-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++/** Stable concern identity: kind, normalized summary, location. */
+ export function concernFingerprint(c: ConcernInput): string {
+-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
+ }
+ 
+ async function readExisting<T>(file: string): Promise<T | undefined> {
+@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
+   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+   const location = input.location ?? existing?.location;
+-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++  const affects = input.affects
++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
++    : existing?.affects;
+   return {
+     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+     summary: existing?.summary ?? input.summary.trim(), detail,
+@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
+   };
+ }
+ 
++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return undefined;
++    throw err;
++  }
++  const [file, line] = locationOf(input.location);
++  for (const name of names.sort()) {
++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
++    const candidate = path.join(dir, name);
++    try {
++      const record = await readYaml<StoredConcernArtifact>(candidate);
++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
++      const [rfile, rline] = locationOf(record.location);
++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
++      return { file: candidate, record };
++    } catch { /* Corrupt entries are not migration candidates. */ }
++  }
++  return undefined;
++}
++
+ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+ export async function aggregateConcerns(
+   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
+@@ -85,10 +110,17 @@ export async function aggregateConcerns(
+     const out: StoredConcernArtifact[] = [];
+     for (const input of concerns) {
+       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+-      const existing = await readExisting<StoredConcernArtifact>(file);
++      let existing = await readExisting<StoredConcernArtifact>(file);
++      let legacyFile: string | undefined;
++      if (!existing) {
++        const migrated = await legacyConcern(dir, input);
++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
++      }
+       const merged = mergeConcern(existing, input, ctx.source, at);
+-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+       await writeYamlAtomic(file, merged);
++      if (legacyFile) await fs.promises.unlink(legacyFile);
+       dirty = true; out.push(merged);
+     }
+     for (const decision of remarkables) {
+@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
+   }
+ }
+ 
+-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+-  const dir = dirOf(taskDir);
+-  let names: string[];
+-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+-    if (err?.code === "ENOENT") return "[]";
+-    throw err;
+-  }
+-  const items = await Promise.all(
+-    names
+-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+-      .map(async (name) => {
+-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+-      })
+-  );
+-  const open = items
+-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+-}
+-
+ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 84a77f6..0cc7f10 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+-  hydrateConcernsYaml,
+   listConcernIds,
+   listConcerns,
+   partitionSuggestions,
+ } from "../concerns.js";
+-import { renderConcernsYaml } from "../triage.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -169,23 +167,13 @@ async function buildArchitectHydration(
+     }
+   }
+ 
+-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+-  // every architect turn the terse decision context the act phase acts on.
+-  // Appended last so the byte cap never evicts it.
+-  const actionableConcerns = (await listConcerns(taskDir)).filter(
+-    (c) => c.status === "open" || c.status === "routed"
+-  );
+-  if (actionableConcerns.length > 0) {
+-    parts.push(
+-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+-    );
+-  }
+-
++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
+   const combined = parts.join("\n\n");
+-  if (combined.length <= maxBytes) {
+-    return combined;
+-  }
+-  return combined.slice(combined.length - maxBytes);
++  const buf = Buffer.from(combined, "utf8");
++  if (buf.length <= maxBytes) return combined;
++  let start = buf.length - maxBytes;
++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
++  return buf.subarray(start).toString("utf8");
+ }
+ 
+ /**
+@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     // Triage ids are those that existed before this review round; capturing
+     // them here mirrors the step-runner exact-id partition.
+     const knownConcernIds = await listConcernIds(taskDir);
+-    const concernsYaml = await hydrateConcernsYaml(taskDir);
+     // Check if review round record already exists
+     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+     const revStepRes = await runAgentStep({
+@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         plan: JSON.stringify(plan, null, 2),
+         intent: intentText,
+         context: contextYaml,
+-        concernsYaml,
+         limits: JSON.stringify(limits, null, 2),
+         dispositionsCriteria: formatDispositionsSection(
+           loadCriteriaBundle(pipeline.criteria).dispositions,
+@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         waveReport: waveSummary,
+         infra: infraYaml,
+       },
++      parentBranch,
+       turnsSemaphore,
+       budgetTracker,
+       iteration,
+@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       plan: JSON.stringify(plan, null, 2),
+       context: contextYaml,
+     },
++    parentBranch,
+     turnsSemaphore,
+     budgetTracker,
+     iteration,
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index 3b158c4..69fba68 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   aggregateConcerns,
+   applyCloseupResolutions,
+-  listOpenConcerns,
+ } from "../concerns.js";
+ import {
+   applyReviewTriage,
+-  renderConcernsYaml,
++  hydrateStepConcerns,
+   TriageValidationError,
+   type ReviewTriageOutcome,
+ } from "../triage.js";
++import { KNOWN_VARS } from "../prompt-vars.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -70,6 +70,8 @@ export interface StepRunOptions {
+   project: ProjectConfig;
+   prompts: any;
+   promptVars: Record<string, string>;
++  parentBranch?: string;
++  gitFn?: typeof git;
+   turnsSemaphore?: Semaphore;
+   customSchema?: JSONSchema;
+   log?: (msg: string) => void;
+@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+   const fragment = stepFragment ?? `steps/${stepId}`;
+   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+-  const openConcerns = await listOpenConcerns(taskDir);
+-  const concernsYaml = openConcerns.length > 0
+-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
+-    : "";
+   const effectivePromptVars: Record<string, string> = {
+     humanInvolvementCriteria: formatHumanInvolvementCriteria(
+       criteriaBundle.humanInvolvement,
+       pipeline.humanInvolvement
+     ),
+-    concernsYaml,
+     ...promptVars,
+   };
++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
++    const stepRole = fragment.replace(/^steps\//, "");
++    if (stepRole === "review" || stepRole === "qa") {
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
++      });
++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
++      });
++    } else {
++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
++      const inputBytes = knownVars
++        .filter((key) => !excluded.has(key))
++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
++    }
++  }
+   let promptText: string;
+   let agentDef: { body: string; tools: string[]; description: string };
+   try {
+diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
+index 923a9d1..479287e 100644
+--- a/plugins/software-factory/src/core/triage.ts
++++ b/plugins/software-factory/src/core/triage.ts
+@@ -1,7 +1,10 @@
++import fs from "node:fs";
++import path from "node:path";
+ import yaml from "yaml";
+ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+-import { applyConcernTriage } from "./concerns.js";
++import { applyConcernTriage, listConcerns } from "./concerns.js";
+ import type { Repo } from "./git/repo.js";
++import { readYaml } from "./records/io.js";
+ import { writeQuestion } from "./steer.js";
+ 
+ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
+@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
+     severity: c.severity,
+     summary: c.summary,
+     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
++    ...(c.status !== "open" ? { status: c.status } : {}),
++    ...(c.disposition ? { disposition: c.disposition } : {}),
++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
++    ...(c.source?.escalated ? { escalated: true } : {}),
+   };
+ }
+ 
++export interface HydrateStepConcernsRequest {
++  stepRole: string;
++  inputBytes?: number;
++  diffBytes?: number;
++  taskDiffBytes?: number;
++  consumer?: string;
++}
++
+ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+ const serialize = (records: Array<Record<string, unknown>>) =>
+   yaml.stringify(records, { lineWidth: 0 });
+ const truncateChars = (text: string, max: number) =>
+   Array.from(text).slice(0, max).join("");
+ 
++/** Normalizes step ids/fragments to their hydration role family. */
++function hydrationRole(stepRole: string): string {
++  const role = stepRole.replace(/^steps\//, "");
++  if (role === "architect" || role.startsWith("architect-")) return "architect";
++  if (role.startsWith("plan-review")) return "plan-review";
++  if (role.startsWith("plan-close-up")) return "plan-close-up";
++  if (role.startsWith("wave-close-up")) return "wave-close-up";
++  if (role === "review" || role === "qa") return role;
++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
++  return role;
++}
++
++function hydrationConsumer(role: string, consumer?: string): string {
++  if (consumer) return consumer;
++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
++  return role === "architect" ? "architect" : role;
++}
++
++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
++  const dir = path.join(taskDir, "concerns");
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
++    throw err;
++  }
++  const records = await Promise.all(
++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++    })
++  );
++  return records
++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
++}
++
++/** Hydrated concern set per consumer (adr-hydrated-sets). */
++export async function listHydratedConcerns(
++  taskDir: string,
++  consumer: string
++): Promise<Array<Record<string, unknown>>> {
++  const includeRouted = consumer === "closeup" || consumer === "architect";
++  const includeEscalated = consumer === "architect";
++  const concerns = (await listConcerns(taskDir)).filter((c) =>
++    c.status === "open" ||
++    (includeRouted && c.status === "routed") ||
++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
++  );
++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
++}
++
++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
++export async function hydrateStepConcerns(
++  taskDir: string,
++  request: HydrateStepConcernsRequest
++): Promise<string> {
++  const role = hydrationRole(request.stepRole);
++  const cap = role === "review" || role === "qa"
++    ? Math.min(request.diffBytes ?? 0, 2000)
++    : role === "wave-close-up" || role === "plan-close-up"
++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
++      : Math.min(request.inputBytes ?? 0, 500);
++  if (cap <= 0) return "";
++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
++}
++
+ /**
+- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
+- * Detail is dropped; over-budget output condenses summaries, drops affects,
+- * then sheds trailing entries until the UTF-8 byte ceiling is met.
++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
++ * condenses summaries, drops affects, then sheds trailing entries; empty output
++ * is returned when no record fits the ceiling.
+  */
+ export function renderConcernsYaml(
+-  concerns: StoredConcernArtifact[],
++  records: Array<Record<string, unknown>>,
+   maxBytes = 8000
+ ): string {
+-  const records = concerns.map(terseConcern);
++  if (maxBytes <= 0 || records.length === 0) return "";
+   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
+     { records },
+     { records: records.map(({ affects: _affects, ...rest }) => rest) },
+@@ -110,7 +194,7 @@ export function renderConcernsYaml(
+       if (utf8Bytes(text) <= maxBytes) return text;
+     }
+   }
+-  return serialize([]);
++  return "";
+ }
+ 
+ /**
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+index a1f0728..ff3f5e8 100644
+--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -317,7 +317,7 @@ describe("Concern store", () => {
+     });
+   }
+ 
+-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
+     const identity = {
+       kind: "risk" as const,
+       summary: "  Flaky   GATE ",
+@@ -339,7 +339,9 @@ describe("Concern store", () => {
+     expect(
+       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+     ).not.toBe(fp);
+-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
+   });
+ 
+   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+new file mode 100644
+index 0000000..d75dcb9
+--- /dev/null
++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+@@ -0,0 +1,839 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import os from "node:os";
++import { createHash } from "node:crypto";
++import yaml from "yaml";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runIteration } from "../../src/core/flows/iteration.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import {
++  aggregateConcerns,
++  applyConcernTriage,
++  concernFingerprint,
++  countConcerns,
++  listConcerns,
++} from "../../src/core/concerns.js";
++import * as triageModule from "../../src/core/triage.js";
++import type {
++  ConcernSource,
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
++ *
++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
++ * plan-review/architect/develop-family from their registered prompt input.
++ */
++
++const ORCH = ".factory";
++const TASK = "hydration-caps";
++const agentsDir = path.resolve(import.meta.dir, "../../agents");
++
++type Hydrate = (
++  taskDir: string,
++  request: {
++    stepRole: string;
++    inputBytes?: number;
++    diffBytes?: number;
++    taskDiffBytes?: number;
++    consumer?: string;
++  }
++) => Promise<string>;
++type ListHydrated = (
++  taskDir: string,
++  consumer: string
++) => Promise<Array<Record<string, any>>>;
++
++/**
++ * New triage exports are looked up dynamically so this file collects against the
++ * pre-implementation module and fails on behavior, not on a missing import.
++ */
++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
++  const mod = triageModule as unknown as {
++    hydrateStepConcerns?: Hydrate;
++    listHydratedConcerns?: ListHydrated;
++  };
++  const hydrate = mod.hydrateStepConcerns;
++  const list = mod.listHydratedConcerns;
++  if (!hydrate || !list) {
++    return {
++      hydrate: (() => {
++        throw new Error("hydrateStepConcerns is not implemented");
++      }) as unknown as Hydrate,
++      list: (() => {
++        throw new Error("listHydratedConcerns is not implemented");
++      }) as unknown as ListHydrated,
++    };
++  }
++  return { hydrate, list };
++}
++
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
++
++describe("Hydration caps (adr-hydration-single-cap)", () => {
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
++    tmpRepo.commit("add hydration caps task");
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
++        reviewer: { role: "alt-workhorse" },
++        qa: { role: "alt-workhorse" },
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++      limits: { maxPlanReviewRounds: 1 },
++    };
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  function concernsDir() {
++    return path.join(taskDir, "concerns");
++  }
++
++  function concernFiles(prefix = "c-") {
++    const dir = concernsDir();
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
++    const harness = new FakeHarness();
++    const label = `${TASK}/runs/review#a1`;
++    harness.scriptOutcome(label, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    harness.scriptOutcome(`${label}#relaunch`, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
++    return runAgentStep({
++      task: TASK,
++      stepId: "review",
++      stepFragment: "steps/review",
++      agent: "reviewer",
++      cwd: taskWt,
++      taskWt,
++      taskDir,
++      recordsDir: path.join(taskDir, "runs"),
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts: promptsFor,
++      promptVars,
++    }).then((result) => ({ result, harness }));
++  }
++
++  function promptOf(harness: FakeHarness): string {
++    const call = harness.calls.find((c) => c.type === "run");
++    if (!call || call.type !== "run") throw new Error("no agent run captured");
++    return call.run.prompt;
++  }
++
++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-aaaaaaaaaa",
++      kind: "risk",
++      summary: "Retry loop can spin",
++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
++      severity: "high",
++      affects: ["item-a"],
++    });
++    await writeConcern({
++      id: "c-bbbbbbbbbb",
++      kind: "blocker",
++      summary: "Missing adapter",
++      detail: "e".repeat(600),
++      severity: "medium",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-aaaaaaaaaa");
++    expect(hydrated).toContain("Retry loop can spin");
++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
++    expect(yaml.parse(hydrated)).toHaveLength(2);
++
++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
++    expect(small).toContain("c-");
++  });
++
++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
++    await writeConcern({
++      id: "c-cccccccccc",
++      kind: "tech-debt",
++      summary: "Plan duplicates the retry helper",
++      detail: "f".repeat(600),
++      severity: "medium",
++      affects: ["m1"],
++    });
++    await writeConcern({
++      id: "c-dddddddddd",
++      kind: "risk",
++      summary: "Milestone boundary depends on an unbuilt adapter",
++      detail: "g".repeat(600),
++      severity: "high",
++      affects: ["m1"],
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
++    expect(hydrated).toContain("c-cccccccccc");
++
++    // Iteration 2+ has merged code on the branch: classification still uses the
++    // registered prompt input, not a branch-state diff inference.
++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
++  });
++
++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-eeeeeeeeee",
++      kind: "tech-debt",
++      summary: "Shared helper duplicated in two modules",
++      detail: "h".repeat(3000),
++      severity: "medium",
++    });
++    await writeConcern({
++      id: "c-ffffffffff",
++      kind: "assumption",
++      summary: "Cache survives restart",
++      detail: "i".repeat(3000),
++      severity: "low",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-eeeeeeeeee");
++
++    const planCloseup = await hydrate(taskDir, {
++      stepRole: "plan-close-up",
++      taskDiffBytes: 5000,
++    });
++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
++  });
++
++  it("returns empty hydration for zero and tiny caps", async () => {
++    await writeConcern({
++      id: "c-1111111111",
++      kind: "risk",
++      summary: "Visible only when the cap allows bytes",
++      detail: "j".repeat(600),
++    });
++
++    const { hydrate } = hydrationApi();
++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(positive).not.toBe("");
++    expect(idLines(positive).length).toBeGreaterThan(0);
++
++    for (const cap of [0, 1, 3]) {
++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
++      expect(empty).toBe("");
++      expect(idLines(empty)).toEqual([]);
++    }
++  });
++
++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
++    const summary = "Retry loop can spin";
++    const cid = "c-2222222222";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary,
++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
++      severity: "high",
++      affects: ["item-a"],
++    });
++
++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
++    expect(promptOf(zero.harness)).not.toContain(cid);
++
++    const hydrated = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++    });
++    const prompt = promptOf(hydrated.harness);
++    expect(prompt).toContain(cid);
++    expect(prompt).toContain(summary);
++    expect(prompt).not.toContain("DETAIL_SENTINEL");
++
++    const supplied = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++      concernsYaml: "CALLER-CONCERNS: c-caller",
++    });
++    const suppliedPrompt = promptOf(supplied.harness);
++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
++    expect(suppliedPrompt).not.toContain(cid);
++  });
++
++  it("computes close-up task diff bytes through the injected git function", async () => {
++    const cid = "c-3333333333";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary: "Close-up concern",
++      detail: "l".repeat(400),
++      severity: "medium",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "wave-close-up.md"),
++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
++
++    const gitCalls: string[][] = [];
++    const gitFn = async (_cwd: string, args: string[]) => {
++      gitCalls.push(args);
++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
++    };
++    const harness = new FakeHarness();
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    try {
++      await runAgentStep({
++        task: TASK,
++        stepId: "wave-close-up-1-1",
++        stepFragment: "steps/wave-close-up",
++        agent: "wave-close-up",
++        cwd: taskWt,
++        taskWt,
++        taskDir,
++        parentBranch: "topic/demo",
++        recordsDir: path.join(taskDir, "runs"),
++        repo,
++        harness,
++        pipeline,
++        project,
++        prompts: closeupPrompts,
++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
++        gitFn,
++      } as any);
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
++    const prompt = promptOf(harness);
++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
++    expect(block).toContain(cid);
++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(block)).toBeLessThan(5000);
++  });
++
++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
++    const cid = "c-4444444444";
++    await writeConcern({
++      id: cid,
++      kind: "blocker",
++      summary: "Database schema migration is pending",
++      detail: "m".repeat(400),
++      severity: "high",
++      status: "routed",
++      disposition: "architect",
++      affects: ["seed"],
++    });
++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
++      id: "dec-1",
++      context: "task",
++      decision: "continue",
++      rationale: "漢".repeat(120),
++      timestamp: "2026-01-01T00:00:00.000Z",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "architect-plan.md"),
++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const architectPrompts = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrideDirs: [overridesDir],
++    });
++
++    const harness = new FakeHarness();
++    let architectPrompt = "";
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
++      architectPrompt = run.prompt;
++      return {
++        ok: true,
++        data: {
++          iteration: 1,
++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
++          itemOutlines: [],
++        },
++      };
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    try {
++      await runIteration({
++        task: TASK,
++        taskDir,
++        taskWt,
++        repo,
++        harness,
++        pipeline: {
++          ...pipeline,
++          limits: {
++            hydrationBytes: 20,
++            maxPlanReviewRounds: 1,
++            maxIterations: 3,
++            maxParallelItems: 2,
++            maxParallelTurns: 4,
++            maxStepAttempts: 3,
++            maxFixRounds: 3,
++          },
++        },
++        project,
++        prompts: architectPrompts,
++      });
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(architectPrompt).toContain(cid);
++    expect(occurrences(architectPrompt, cid)).toBe(1);
++    expect(architectPrompt).not.toContain("--- Concerns ---");
++
++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
++    expect(debt).not.toContain("\uFFFD");
++    expect(steering).not.toContain("\uFFFD");
++
++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
++    expect(concerns).toContain(cid);
++  });
++});
++
++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
++  let tmpRepo: TmpRepo;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  async function writeRemarkable(
++    id: string,
++    chosen: string,
++    overrides: Record<string, unknown> = {}
++  ) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
++      id,
++      chosen,
++      alternatives: ["Other"],
++      why: "w".repeat(300),
++      status: "open",
++      source: { record: "001-architect-plan-a1", agent: "architect" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    });
++  }
++
++  it("hydrates open concerns with pending resolutions for review", async () => {
++    const pending = {
++      action: "carry" as const,
++      note: "Needs an architect decision",
++      by: "wave-close-up",
++      at: "2026-01-02T00:00:00.000Z",
++    };
++    await writeConcern({
++      id: "c-5555555555",
++      summary: "Needs a decision",
++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
++      pendingResolution: pending,
++    });
++
++    const { list } = hydrationApi();
++    for (const consumer of ["review", "develop", "qa"]) {
++      const hydrated = await list(taskDir, consumer);
++      expect(hydrated).toHaveLength(1);
++      expect(hydrated[0]).toMatchObject({
++        id: "c-5555555555",
++        kind: "risk",
++        summary: "Needs a decision",
++        pendingResolution: pending,
++      });
++      expect(hydrated[0]).not.toHaveProperty("detail");
++    }
++  });
++
++  it("includes routed concerns for close-ups but not for review", async () => {
++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
++    await writeConcern({
++      id: "c-7777777777",
++      status: "routed",
++      disposition: "architect",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
++
++    const closeup = await list(taskDir, "closeup");
++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
++  });
++
++  it("hydrates open remarkables as terse remarkable records", async () => {
++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++  });
++
++  it("includes dismissed escalated concerns only in the architect set", async () => {
++    await writeConcern({
++      id: "c-9999999999",
++      status: "dismissed",
++      dismissReason: "not real",
++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
++      createdAt: "2026-01-01T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-ababababab",
++      status: "dismissed",
++      dismissReason: "quiet",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-acacacacac",
++      status: "open",
++      createdAt: "2026-01-03T00:00:00.000Z",
++    });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
++    expect(architect[0]).toMatchObject({
++      id: "c-9999999999",
++      status: "dismissed",
++      escalated: true,
++    });
++  });
++
++  it("counts concerns only, never remarkables", async () => {
++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
++
++    await writeConcern({ id: "c-adadadadad", status: "open" });
++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
++  });
++});
++
++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function source(record = "001-develop-a1"): ConcernSource {
++    return { record, agent: "developer" };
++  }
++
++  function concernFiles() {
++    const dir = path.join(taskDir, "concerns");
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
++  function legacyFingerprint(input: {
++    kind: string;
++    summary: string;
++    location?: { file: string; line?: number };
++    affects?: string[];
++  }): string {
++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
++    const parts = [
++      input.kind,
++      norm(input.summary),
++      input.location?.file.trim() ?? null,
++      input.location?.line ?? null,
++      affects,
++    ];
++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++  }
++
++  it("fingerprints kind, normalized summary, and location without affects", () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "  Flaky   GATE ",
++      location: { file: "src/core/example.ts", line: 7 },
++    };
++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
++
++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
++
++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
++    expect(
++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++    ).not.toBe(id);
++  });
++
++  it("unions affects without forking and preserves terminal status", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Flaky gate blocks merges",
++      location: { file: "src/core/merge.ts", line: 12 },
++    };
++    const id = concernFingerprint(identity);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source() },
++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    let stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${id}.yaml`)
++    );
++    expect(stored.affects).toEqual(["item-a", "item-b"]);
++    expect(stored.status).toBe("open");
++    expect(stored.detail).toBe("a much longer detail");
++    expect(stored.severity).toBe("high");
++    expect(stored.source.escalated).toBe(true);
++
++    await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
++      ],
++    });
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("003-review-a1") },
++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
++    expect(stored.status).toBe("dismissed");
++    expect(stored.dismissReason).toBe("covered by ADR-1");
++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
++    expect(stored.source.escalated).toBe(true);
++  });
++
++  it("renames a legacy affects-keyed file to the stable id", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Legacy concern",
++      location: { file: "src/legacy.ts", line: 4 },
++    };
++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
++    const stableId = concernFingerprint(identity);
++    expect(legacyId).not.toBe(stableId);
++
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
++      id: legacyId,
++      ...identity,
++      detail: "legacy detail",
++      severity: "medium",
++      status: "open",
++      affects: ["old"],
++      source: { record: "000-develop-a1", agent: "developer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++    expect(concernFiles()).toEqual([legacyId]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
++    );
++
++    expect(concernFiles()).toEqual([stableId]);
++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${stableId}.yaml`)
++    );
++    expect(stored.id).toBe(stableId);
++    expect(stored.affects).toEqual(["new", "old"]);
++    expect(stored.detail).toBe("new detail");
++    expect(stored.severity).toBe("high");
++
++    // Re-emitting with another affect keeps the same stable triage id.
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, affects: ["new", "third"] }]
++    );
++    expect(concernFiles()).toEqual([stableId]);
++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
++  });
++});
+diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+index fb7cc9b..df5eac8 100644
+--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+@@ -16,9 +16,9 @@ import {
+   concernMailboxId,
+   isDebtConcern,
+   partitionReviewSuggestions,
+-  renderConcernsYaml,
+   type ReviewTriageOutcome,
+ } from "../../src/core/triage.js";
++import * as triageModule from "../../src/core/triage.js";
+ import type {
+   PipelineConfig,
+   ProjectConfig,
+@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         assignment: "Review the item",
+         checks: "",
+         testDiff: "",
+-        diff: "",
++        diff: "d".repeat(3000),
+         dispositionsCriteria: "",
+       },
+     });
+@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+     expect(qa.fixRequired).toBe(false);
+   });
+ 
+-  it("renders condensing concern YAML without detail and within the byte cap", () => {
++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
+     const concerns = [
+       storedConcern({
+         id: "c-aaaaaaaaaa",
+@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         detail: "e".repeat(600),
+       }),
+     ];
+-
+-    const rendered = renderConcernsYaml(concerns);
++    for (const concern of concerns) await writeConcern(concern);
++
++    const hydrate = (
++      triageModule as unknown as {
++        hydrateStepConcerns?: (
++          taskDir: string,
++          request: { stepRole: string; diffBytes: number }
++        ) => Promise<string>;
++      }
++    ).hydrateStepConcerns;
++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
++
++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
+     const parsed = yaml.parse(rendered);
+     expect(Array.isArray(parsed)).toBe(true);
+     expect(parsed).toHaveLength(2);
+@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+       Buffer.byteLength(JSON.stringify(concerns), "utf8")
+     );
+ 
+-    const capped = renderConcernsYaml(concerns, 120);
++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
+     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
+     expect(capped).not.toContain("\uFFFD");
+   });
+diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+index 3eb7799..58961a9 100644
+--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
+     prompts = loadPromptLibrary({
+       builtinDir: path.resolve(import.meta.dir, "../../agents"),
+       overrideDirs: [],
++      // The single hydration source is concernsYaml; prompt fragments gain the
++      // placeholder in the prompt-fragments item, so this test supplies it here.
++      overrides: {
++        "steps/architect-plan":
++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
++        "steps/architect-wave-report":
++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
++      },
+     });
+   });
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
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..87d3ff9
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml
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
+timeoutSec: 3600
+status: ok
+startedAt: 2026-11-08T20:56:04.392Z
+session: 01a1bcf2-6678-77ea-95dd-a86a81b75880
+endedAt: 2026-11-08T21:48:09.337Z
+usage:
+  inputTokens: 81514
+  outputTokens: 72122
+  costUsd: 0.03002
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T20-56-04-984Z_01a1bcf2-6678-77ea-95dd-a86a81b75880.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml
new file mode 100644
index 0000000..ed61f3f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml
@@ -0,0 +1,30 @@
+status: changes_requested
+summary: Legacy migration clobbers stored detail on detail-less input;
+  caps/sets/fingerprint/unions otherwise verified
+suggestions:
+  - id: legacy-migration-detail-clobber
+    disposition: fix
+    summary: Legacy rename-merge overwrites stored detail with summary fallback when
+      incoming detail is omitted
+    detail: concerns.ts:120 unconditionally sets merged.detail=(input.detail ??
+      input.summary).trim() on legacy migration, bypassing mergeConcern's
+      longer-wins. ConcernInput.detail is optional and aggregate validation
+      doesn't require it (concerns.ts:12-13,101-105), and the test suite itself
+      emits detail-less concerns ({...identity, affects}) — so a detail-less
+      emission triggering migration would degrade a rich stored legacy detail to
+      the bare summary. Gate the overwrite on incoming detail presence (e.g.
+      only when input.detail?.trim() is non-empty), preserving the test-mandated
+      incoming-wins when detail is supplied (migration test provides 'new
+      detail').
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 120
+  - id: dead-yaml-import
+    disposition: optional
+    summary: Remove dead yaml import left after hydrateConcernsYaml deletion
+    detail: concerns.ts:4 imports yaml but zero yaml.* call sites remain (verified
+      via grep; only '.yaml' filename strings). Typecheck doesn't flag it, but
+      prune per wrapper/redundancy discipline.
+    location:
+      file: plugins/software-factory/src/core/concerns.ts
+      line: 4
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/checks.yaml
new file mode 100644
index 0000000..5bd0e7a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/checks.yaml
@@ -0,0 +1,113 @@
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
+        durationMs: 4933
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 97730
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-9m2t9T/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2858526
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2858526
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2858526
+
+           399 pass
+           2 skip
+           0 fail
+           1893 expect() calls
+          Ran 401 tests across 66 files. [97.57s]
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
+        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794174728721-wy8mhlmi5om.xml
+      junitCaseCount: 15
+      junitCaseIds:
+        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+          min(diffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+          at min(inputBytes, 500) bytes
+        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+          at min(taskDiffBytes, 2000) bytes
+        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+          zero and tiny caps
+        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+          by diff bytes and lets caller-supplied values win
+        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+          bytes through the injected git function
+        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+          from concernsYaml without a duplicate concerns section
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+          pending resolutions for review
+        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+          close-ups but not for review
+        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+          terse remarkable records
+        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+          concerns only in the architect set
+        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+          remarkables
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+          and location without affects
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).unions affects without forking and
+          preserves terminal status
+        - Concern identity and affects union
+          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+          the stable id
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 225/300 production lines changed"
+    details:
+      changedLines:
+        added: 163
+        deleted: 62
+        total: 225
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+          - plugins/software-factory/src/core/flows/step-runner.ts
+          - plugins/software-factory/src/core/triage.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/input.md
new file mode 100644
index 0000000..c87bbb8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/input.md
@@ -0,0 +1,8329 @@
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
+  "slug": "hydration-fingerprint-caps",
+  "kind": "dev",
+  "title": "Unified hydration, caps, fingerprint",
+  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+  "outlineRef": "hydration-fingerprint-caps",
+  "milestone": "m1-hydration-prompts",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-hydration-prompts:1",
+    "m1-hydration-prompts:2",
+    "m1-hydration-prompts:3",
+    "m1-hydration-prompts:4",
+    "m1-hydration-prompts:6",
+    "m1-hydration-prompts:7"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+    "plugins/software-factory/src/core/artifacts.ts:313-325"
+  ]
+}
+
+## Review Feedback
+- [FIX] Legacy rename-merge overwrites stored detail with summary fallback when incoming detail is omitted: concerns.ts:120 unconditionally sets merged.detail=(input.detail ?? input.summary).trim() on legacy migration, bypassing mergeConcern's longer-wins. ConcernInput.detail is optional and aggregate validation doesn't require it (concerns.ts:12-13,101-105), and the test suite itself emits detail-less concerns ({...identity, affects}) — so a detail-less emission triggering migration would degrade a rich stored legacy detail to the bare summary. Gate the overwrite on incoming detail presence (e.g. only when input.detail?.trim() is non-empty), preserving the test-mandated incoming-wins when detail is supplied (migration test provides 'new detail'). (plugins/software-factory/src/core/concerns.ts)
+
+- [OPTIONAL] Remove dead yaml import left after hydrateConcernsYaml deletion: concerns.ts:4 imports yaml but zero yaml.* call sites remain (verified via grep; only '.yaml' filename strings). Typecheck doesn't flag it, but prune per wrapper/redundancy discipline.
+
+## Check Results
+
+
+## Current Diff
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..a228d4c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,57 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 14 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..edfeb92
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,66 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..3392505
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T19:23:15.847Z
++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++endedAt: 2026-11-08T19:38:59.292Z
++usage:
++  inputTokens: 190368
++  outputTokens: 67345
++  costUsd: 0.104286
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..bdc4fbc
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,103 @@
++status: ok
++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
++  tests) covering the ADR contracts: step-role byte caps (review/qa
++  min(diff,2000), close-ups min(taskDiff,2000),
++  plan-review/architect/develop-family min(input,500)), '' semantics at
++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
++  rule, close-up taskDiff via injectable gitFn, architect hydration from
++  concernsYaml without the removed duplicated '--- Concerns ---' section and
++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
++  affects-free fingerprint identity, affects union without forking incl.
++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
++  hydrates through the new API with a non-empty diff; architect routing tests
++  supply the concernsYaml placeholder that the prompt-fragments item will add).
++  Production code was left untouched; only test files changed. New production
++  API is looked up dynamically so red failures are assertion/runtime failures in
++  executed tests, not collection/import errors."
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
++    compiles against current production; new options are passed through an
++    explicit any-cast only in tests)."
++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
++    not on import/collection errors."
++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
++    --reporter=junit` -> suite collected; all 14 declared node ids present with
++    status=fail (<failure>). Probe IDs match the runner's native
++    `classname.name` form.
++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
++    fail (only the updated fingerprint test expecting affects-independent
++    identity); confirms the suite collects after the test edit."
++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
++    fail (only the rewritten hydration-rendering test awaiting
++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
++    review hydration is exercised."
++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
++    routed, and the old open-only step-runner path cannot hydrate them without
++    the removed buildArchitectHydration concerns section."
++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
++    hydration-fingerprint-caps.test.ts; no production files touched."
++concerns:
++  - The routing-architect-consult test now injects a minimal in-memory
++    architect-plan/architect-wave-report override containing {{concernsYaml}},
++    because builtin fragments gain that placeholder only in the separate
++    prompt-fragments item. The override should be removable once that item
++    lands.
++  - Tests access the not-yet-existing triage exports through a dynamic namespace
++    lookup so the suite collects and target-red failures are behavioral rather
++    than import errors; once green, the lookup can be replaced by direct named
++    imports.
++  - One non-declared test in the new file ('counts concerns only, never
++    remarkables') already passes because countConcerns is intentionally
++    unchanged by this item.
++notes: "Implementation plan for the green step is fully specified by the tests:
++  add
++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
++  renderConcernsYaml with strict empty fallback; drop affects from
++  concernFingerprint, union affects (including terminal statuses) with an
++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
++  scan with no GC; inject concernsYaml in step-runner only when caller
++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
++  via git(parentBranch...HEAD) with an injectable gitFn; delete
++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
++  without concerns."
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..410c83f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,113 @@
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
++        durationMs: 4842
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 86983
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
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
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++
++           399 pass
++           2 skip
++           0 fail
++           1893 expect() calls
++          Ran 401 tests across 66 files. [86.84s]
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
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 224/300 production lines changed"
++    details:
++      changedLines:
++        added: 163
++        deleted: 61
++        total: 224
++        files:
++          - plugins/software-factory/src/core/concerns.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++          - plugins/software-factory/src/core/flows/step-runner.ts
++          - plugins/software-factory/src/core/triage.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..6bf3c27
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,85 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/hydration-fingerprint-caps.test.ts"
++  ],
++  "expectRed": [
++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
++  ]
++}
++
++## Context & Citations
++[
++  "docs/factory.v2.md:89-103",
++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..2468de3
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:39:01.204Z
++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
++endedAt: 2026-11-08T19:48:44.187Z
++usage:
++  inputTokens: 104345
++  outputTokens: 31138
++  costUsd: 0.044819
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..f9624ec
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,69 @@
++status: ok
++summary: Implemented unified concern hydration with step-role byte caps,
++  hydrated concern sets, and affects-independent fingerprints with legacy
++  rename-merge. Triage now owns
++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
++  injects concernsYaml only when the caller does not supply it, computing
++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
++  deleted. Concerns merge now unions affects while preserving terminal status,
++  and aggregate migrates legacy affects-keyed files to stable ids. All target
++  tests, typecheck, and the full suite pass.
++target:
++  selectors:
++    - test/engine/hydration-fingerprint-caps.test.ts
++  expectRed:
++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++      min(diffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++      min(inputBytes, 500) bytes
++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++      min(taskDiffBytes, 2000) bytes
++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++      and tiny caps
++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++      diff bytes and lets caller-supplied values win
++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++      bytes through the injected git function
++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++      concernsYaml without a duplicate concerns section
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++      pending resolutions for review
++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++      close-ups but not for review
++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++      terse remarkable records
++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++      concerns only in the architect set
++    - Concern identity and affects union
++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++      location without affects
++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++      affects without forking and preserves terminal status
++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++      a legacy affects-keyed file to the stable id
++evidence:
++  - cd plugins/software-factory && TMPDIR=/tmp bun test
++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
++    expect() calls
++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
++    fail, 401 tests across 66 files (95.78s)
++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
++    deletions within prod budget
++  - Manual diff review confirmed hydrateConcernsYaml removed, no
++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
++    no duplicate concerns section
++concerns:
++  - Legacy rename-merge intentionally treats the incoming detail as
++    authoritative when migrating a pre-union-fingerprint file, while ordinary
++    merges retain the longer stored detail per existing behavior.
++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
++    fragment, so custom unregistered fragments with a hand-added placeholder
++    rely on caller-supplied concernsYaml.
++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
++  computation; iteration passes parentBranch to wave and plan close-ups.
++  renderConcernsYaml now renders pre-shaped records and returns '' when no
++  record fits the cap.
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..1fe7b7c
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
+@@ -0,0 +1,53 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 14 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794167425243-3rnydh3yvvm.xml
++      junitCaseCount: 15
++      junitCaseIds:
++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++          min(diffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++          at min(inputBytes, 500) bytes
++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++          at min(taskDiffBytes, 2000) bytes
++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++          zero and tiny caps
++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++          by diff bytes and lets caller-supplied values win
++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++          bytes through the injected git function
++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++          from concernsYaml without a duplicate concerns section
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++          pending resolutions for review
++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++          close-ups but not for review
++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++          terse remarkable records
++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++          concerns only in the architect set
++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++          remarkables
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++          and location without affects
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).unions affects without forking and
++          preserves terminal status
++        - Concern identity and affects union
++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++          the stable id
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..83f6b95
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
+@@ -0,0 +1,2003 @@
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..a228d4c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,57 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
+++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 14 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..edfeb92
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,66 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..3392505
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:23:15.847Z
+++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+++endedAt: 2026-11-08T19:38:59.292Z
+++usage:
+++  inputTokens: 190368
+++  outputTokens: 67345
+++  costUsd: 0.104286
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..bdc4fbc
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,103 @@
+++status: ok
+++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
+++  tests) covering the ADR contracts: step-role byte caps (review/qa
+++  min(diff,2000), close-ups min(taskDiff,2000),
+++  plan-review/architect/develop-family min(input,500)), '' semantics at
+++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
+++  rule, close-up taskDiff via injectable gitFn, architect hydration from
+++  concernsYaml without the removed duplicated '--- Concerns ---' section and
+++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
+++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
+++  affects-free fingerprint identity, affects union without forking incl.
+++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
+++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
+++  hydrates through the new API with a non-empty diff; architect routing tests
+++  supply the concernsYaml placeholder that the prompt-fragments item will add).
+++  Production code was left untouched; only test files changed. New production
+++  API is looked up dynamically so red failures are assertion/runtime failures in
+++  executed tests, not collection/import errors."
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
+++    compiles against current production; new options are passed through an
+++    explicit any-cast only in tests)."
+++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
+++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
+++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
+++    not on import/collection errors."
+++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
+++    --reporter=junit` -> suite collected; all 14 declared node ids present with
+++    status=fail (<failure>). Probe IDs match the runner's native
+++    `classname.name` form.
+++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
+++    fail (only the updated fingerprint test expecting affects-independent
+++    identity); confirms the suite collects after the test edit."
+++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
+++    fail (only the rewritten hydration-rendering test awaiting
+++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
+++    review hydration is exercised."
+++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
+++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
+++    routed, and the old open-only step-runner path cannot hydrate them without
+++    the removed buildArchitectHydration concerns section."
+++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
+++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
+++    hydration-fingerprint-caps.test.ts; no production files touched."
+++concerns:
+++  - The routing-architect-consult test now injects a minimal in-memory
+++    architect-plan/architect-wave-report override containing {{concernsYaml}},
+++    because builtin fragments gain that placeholder only in the separate
+++    prompt-fragments item. The override should be removable once that item
+++    lands.
+++  - Tests access the not-yet-existing triage exports through a dynamic namespace
+++    lookup so the suite collects and target-red failures are behavioral rather
+++    than import errors; once green, the lookup can be replaced by direct named
+++    imports.
+++  - One non-declared test in the new file ('counts concerns only, never
+++    remarkables') already passes because countConcerns is intentionally
+++    unchanged by this item.
+++notes: "Implementation plan for the green step is fully specified by the tests:
+++  add
+++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
+++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
+++  renderConcernsYaml with strict empty fallback; drop affects from
+++  concernFingerprint, union affects (including terminal statuses) with an
+++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
+++  scan with no GC; inject concernsYaml in step-runner only when caller
+++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
+++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
+++  via git(parentBranch...HEAD) with an injectable gitFn; delete
+++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
+++  without concerns."
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..410c83f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,113 @@
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
+++        durationMs: 4842
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 86983
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+++          ----------------------------------------------------------------
+++          Blocking Questions:
+++            (none)
+++          ----------------------------------------------------------------
+++          Digest Questions:
+++            (none)
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++
+++           399 pass
+++           2 skip
+++           0 fail
+++           1893 expect() calls
+++          Ran 401 tests across 66 files. [86.84s]
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
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 224/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 163
+++        deleted: 61
+++        total: 224
+++        files:
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++          - plugins/software-factory/src/core/flows/step-runner.ts
+++          - plugins/software-factory/src/core/triage.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..6bf3c27
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,85 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/hydration-fingerprint-caps.test.ts"
+++  ],
+++  "expectRed": [
+++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
+++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
+++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
+++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
+++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
+++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..2468de3
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:39:01.204Z
+++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
+++endedAt: 2026-11-08T19:48:44.187Z
+++usage:
+++  inputTokens: 104345
+++  outputTokens: 31138
+++  costUsd: 0.044819
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..f9624ec
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,69 @@
+++status: ok
+++summary: Implemented unified concern hydration with step-role byte caps,
+++  hydrated concern sets, and affects-independent fingerprints with legacy
+++  rename-merge. Triage now owns
+++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
+++  injects concernsYaml only when the caller does not supply it, computing
+++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
+++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
+++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
+++  deleted. Concerns merge now unions affects while preserving terminal status,
+++  and aggregate migrates legacy affects-keyed files to stable ids. All target
+++  tests, typecheck, and the full suite pass.
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
+++    expect() calls
+++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
+++    fail, 401 tests across 66 files (95.78s)
+++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
+++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
+++    deletions within prod budget
+++  - Manual diff review confirmed hydrateConcernsYaml removed, no
+++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
+++    no duplicate concerns section
+++concerns:
+++  - Legacy rename-merge intentionally treats the incoming detail as
+++    authoritative when migrating a pre-union-fingerprint file, while ordinary
+++    merges retain the longer stored detail per existing behavior.
+++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
+++    fragment, so custom unregistered fragments with a hand-added placeholder
+++    rely on caller-supplied concernsYaml.
+++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
+++  computation; iteration passes parentBranch to wave and plan close-ups.
+++  renderConcernsYaml now renders pre-shaped records and returns '' when no
+++  record fits the cap.
++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
++index 5e2078d..197bc81 100644
++--- a/plugins/software-factory/src/core/concerns.ts
+++++ b/plugins/software-factory/src/core/concerns.ts
++@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
++ const hash = (prefix: string, parts: unknown[]) =>
++   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
++-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
++ 
++-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+++/** Stable concern identity: kind, normalized summary, location. */
++ export function concernFingerprint(c: ConcernInput): string {
++-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
++ }
++ 
++ async function readExisting<T>(file: string): Promise<T | undefined> {
++@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
++   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
++   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
++   const location = input.location ?? existing?.location;
++-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+++  const affects = input.affects
+++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
+++    : existing?.affects;
++   return {
++     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
++     summary: existing?.summary ?? input.summary.trim(), detail,
++@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
++   };
++ }
++ 
+++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
+++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT") return undefined;
+++    throw err;
+++  }
+++  const [file, line] = locationOf(input.location);
+++  for (const name of names.sort()) {
+++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
+++    const candidate = path.join(dir, name);
+++    try {
+++      const record = await readYaml<StoredConcernArtifact>(candidate);
+++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
+++      const [rfile, rline] = locationOf(record.location);
+++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
+++      return { file: candidate, record };
+++    } catch { /* Corrupt entries are not migration candidates. */ }
+++  }
+++  return undefined;
+++}
+++
++ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
++ export async function aggregateConcerns(
++   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
++@@ -85,10 +110,17 @@ export async function aggregateConcerns(
++     const out: StoredConcernArtifact[] = [];
++     for (const input of concerns) {
++       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
++-      const existing = await readExisting<StoredConcernArtifact>(file);
+++      let existing = await readExisting<StoredConcernArtifact>(file);
+++      let legacyFile: string | undefined;
+++      if (!existing) {
+++        const migrated = await legacyConcern(dir, input);
+++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
+++      }
++       const merged = mergeConcern(existing, input, ctx.source, at);
++-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
+++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++       await writeYamlAtomic(file, merged);
+++      if (legacyFile) await fs.promises.unlink(legacyFile);
++       dirty = true; out.push(merged);
++     }
++     for (const decision of remarkables) {
++@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
++   }
++ }
++ 
++-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
++-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
++-  const dir = dirOf(taskDir);
++-  let names: string[];
++-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++-    if (err?.code === "ENOENT") return "[]";
++-    throw err;
++-  }
++-  const items = await Promise.all(
++-    names
++-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
++-      .map(async (name) => {
++-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++-      })
++-  );
++-  const open = items
++-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
++-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
++-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
++-}
++-
++ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++   const updated = await locks.runExclusive(ctx.taskDir, async () => {
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index 84a77f6..0cc7f10 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++-  hydrateConcernsYaml,
++   listConcernIds,
++   listConcerns,
++   partitionSuggestions,
++ } from "../concerns.js";
++-import { renderConcernsYaml } from "../triage.js";
++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
++ import { validateEdits } from "../plan/limits.js";
++ import { applyEdits } from "../plan/apply.js";
++@@ -169,23 +167,13 @@ async function buildArchitectHydration(
++     }
++   }
++ 
++-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
++-  // every architect turn the terse decision context the act phase acts on.
++-  // Appended last so the byte cap never evicts it.
++-  const actionableConcerns = (await listConcerns(taskDir)).filter(
++-    (c) => c.status === "open" || c.status === "routed"
++-  );
++-  if (actionableConcerns.length > 0) {
++-    parts.push(
++-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
++-    );
++-  }
++-
+++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
++   const combined = parts.join("\n\n");
++-  if (combined.length <= maxBytes) {
++-    return combined;
++-  }
++-  return combined.slice(combined.length - maxBytes);
+++  const buf = Buffer.from(combined, "utf8");
+++  if (buf.length <= maxBytes) return combined;
+++  let start = buf.length - maxBytes;
+++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
+++  return buf.subarray(start).toString("utf8");
++ }
++ 
++ /**
++@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++     // Triage ids are those that existed before this review round; capturing
++     // them here mirrors the step-runner exact-id partition.
++     const knownConcernIds = await listConcernIds(taskDir);
++-    const concernsYaml = await hydrateConcernsYaml(taskDir);
++     // Check if review round record already exists
++     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
++     const revStepRes = await runAgentStep({
++@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         plan: JSON.stringify(plan, null, 2),
++         intent: intentText,
++         context: contextYaml,
++-        concernsYaml,
++         limits: JSON.stringify(limits, null, 2),
++         dispositionsCriteria: formatDispositionsSection(
++           loadCriteriaBundle(pipeline.criteria).dispositions,
++@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         waveReport: waveSummary,
++         infra: infraYaml,
++       },
+++      parentBranch,
++       turnsSemaphore,
++       budgetTracker,
++       iteration,
++@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++       plan: JSON.stringify(plan, null, 2),
++       context: contextYaml,
++     },
+++    parentBranch,
++     turnsSemaphore,
++     budgetTracker,
++     iteration,
++diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
++index 3b158c4..69fba68 100644
++--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++++ b/plugins/software-factory/src/core/flows/step-runner.ts
++@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++   aggregateConcerns,
++   applyCloseupResolutions,
++-  listOpenConcerns,
++ } from "../concerns.js";
++ import {
++   applyReviewTriage,
++-  renderConcernsYaml,
+++  hydrateStepConcerns,
++   TriageValidationError,
++   type ReviewTriageOutcome,
++ } from "../triage.js";
+++import { KNOWN_VARS } from "../prompt-vars.js";
++ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
++ import { captureHead, enforceHead } from "../git/guard.js";
++ import { commitAll } from "../git/commit.js";
++@@ -70,6 +70,8 @@ export interface StepRunOptions {
++   project: ProjectConfig;
++   prompts: any;
++   promptVars: Record<string, string>;
+++  parentBranch?: string;
+++  gitFn?: typeof git;
++   turnsSemaphore?: Semaphore;
++   customSchema?: JSONSchema;
++   log?: (msg: string) => void;
++@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
++   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
++   const fragment = stepFragment ?? `steps/${stepId}`;
++   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
++-  const openConcerns = await listOpenConcerns(taskDir);
++-  const concernsYaml = openConcerns.length > 0
++-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
++-    : "";
++   const effectivePromptVars: Record<string, string> = {
++     humanInvolvementCriteria: formatHumanInvolvementCriteria(
++       criteriaBundle.humanInvolvement,
++       pipeline.humanInvolvement
++     ),
++-    concernsYaml,
++     ...promptVars,
++   };
+++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
+++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
+++    const stepRole = fragment.replace(/^steps\//, "");
+++    if (stepRole === "review" || stepRole === "qa") {
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
+++      });
+++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
+++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
+++      });
+++    } else {
+++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
+++      const inputBytes = knownVars
+++        .filter((key) => !excluded.has(key))
+++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
+++    }
+++  }
++   let promptText: string;
++   let agentDef: { body: string; tools: string[]; description: string };
++   try {
++diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
++index 923a9d1..479287e 100644
++--- a/plugins/software-factory/src/core/triage.ts
+++++ b/plugins/software-factory/src/core/triage.ts
++@@ -1,7 +1,10 @@
+++import fs from "node:fs";
+++import path from "node:path";
++ import yaml from "yaml";
++ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++-import { applyConcernTriage } from "./concerns.js";
+++import { applyConcernTriage, listConcerns } from "./concerns.js";
++ import type { Repo } from "./git/repo.js";
+++import { readYaml } from "./records/io.js";
++ import { writeQuestion } from "./steer.js";
++ 
++ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
++@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
++     severity: c.severity,
++     summary: c.summary,
++     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
+++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
+++    ...(c.status !== "open" ? { status: c.status } : {}),
+++    ...(c.disposition ? { disposition: c.disposition } : {}),
+++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
+++    ...(c.source?.escalated ? { escalated: true } : {}),
++   };
++ }
++ 
+++export interface HydrateStepConcernsRequest {
+++  stepRole: string;
+++  inputBytes?: number;
+++  diffBytes?: number;
+++  taskDiffBytes?: number;
+++  consumer?: string;
+++}
+++
++ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++ const serialize = (records: Array<Record<string, unknown>>) =>
++   yaml.stringify(records, { lineWidth: 0 });
++ const truncateChars = (text: string, max: number) =>
++   Array.from(text).slice(0, max).join("");
++ 
+++/** Normalizes step ids/fragments to their hydration role family. */
+++function hydrationRole(stepRole: string): string {
+++  const role = stepRole.replace(/^steps\//, "");
+++  if (role === "architect" || role.startsWith("architect-")) return "architect";
+++  if (role.startsWith("plan-review")) return "plan-review";
+++  if (role.startsWith("plan-close-up")) return "plan-close-up";
+++  if (role.startsWith("wave-close-up")) return "wave-close-up";
+++  if (role === "review" || role === "qa") return role;
+++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
+++  return role;
+++}
+++
+++function hydrationConsumer(role: string, consumer?: string): string {
+++  if (consumer) return consumer;
+++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
+++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
+++  return role === "architect" ? "architect" : role;
+++}
+++
+++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
+++  const dir = path.join(taskDir, "concerns");
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
+++    throw err;
+++  }
+++  const records = await Promise.all(
+++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
+++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+++    })
+++  );
+++  return records
+++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
+++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
+++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
+++}
+++
+++/** Hydrated concern set per consumer (adr-hydrated-sets). */
+++export async function listHydratedConcerns(
+++  taskDir: string,
+++  consumer: string
+++): Promise<Array<Record<string, unknown>>> {
+++  const includeRouted = consumer === "closeup" || consumer === "architect";
+++  const includeEscalated = consumer === "architect";
+++  const concerns = (await listConcerns(taskDir)).filter((c) =>
+++    c.status === "open" ||
+++    (includeRouted && c.status === "routed") ||
+++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
+++  );
+++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
+++}
+++
+++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
+++export async function hydrateStepConcerns(
+++  taskDir: string,
+++  request: HydrateStepConcernsRequest
+++): Promise<string> {
+++  const role = hydrationRole(request.stepRole);
+++  const cap = role === "review" || role === "qa"
+++    ? Math.min(request.diffBytes ?? 0, 2000)
+++    : role === "wave-close-up" || role === "plan-close-up"
+++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
+++      : Math.min(request.inputBytes ?? 0, 500);
+++  if (cap <= 0) return "";
+++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
+++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
+++}
+++
++ /**
++- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
++- * Detail is dropped; over-budget output condenses summaries, drops affects,
++- * then sheds trailing entries until the UTF-8 byte ceiling is met.
+++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
+++ * condenses summaries, drops affects, then sheds trailing entries; empty output
+++ * is returned when no record fits the ceiling.
++  */
++ export function renderConcernsYaml(
++-  concerns: StoredConcernArtifact[],
+++  records: Array<Record<string, unknown>>,
++   maxBytes = 8000
++ ): string {
++-  const records = concerns.map(terseConcern);
+++  if (maxBytes <= 0 || records.length === 0) return "";
++   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
++     { records },
++     { records: records.map(({ affects: _affects, ...rest }) => rest) },
++@@ -110,7 +194,7 @@ export function renderConcernsYaml(
++       if (utf8Bytes(text) <= maxBytes) return text;
++     }
++   }
++-  return serialize([]);
+++  return "";
++ }
++ 
++ /**
++diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++index a1f0728..ff3f5e8 100644
++--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++@@ -317,7 +317,7 @@ describe("Concern store", () => {
++     });
++   }
++ 
++-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
++     const identity = {
++       kind: "risk" as const,
++       summary: "  Flaky   GATE ",
++@@ -339,7 +339,9 @@ describe("Concern store", () => {
++     expect(
++       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++     ).not.toBe(fp);
++-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
++   });
++ 
++   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
++diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++new file mode 100644
++index 0000000..d75dcb9
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++@@ -0,0 +1,839 @@
+++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+++import fs from "node:fs";
+++import path from "node:path";
+++import os from "node:os";
+++import { createHash } from "node:crypto";
+++import yaml from "yaml";
+++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+++import { runAgentStep } from "../../src/core/flows/step-runner.js";
+++import { runIteration } from "../../src/core/flows/iteration.js";
+++import { Repo } from "../../src/core/git/repo.js";
+++import { loadPromptLibrary } from "../../src/core/prompts.js";
+++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+++import {
+++  aggregateConcerns,
+++  applyConcernTriage,
+++  concernFingerprint,
+++  countConcerns,
+++  listConcerns,
+++} from "../../src/core/concerns.js";
+++import * as triageModule from "../../src/core/triage.js";
+++import type {
+++  ConcernSource,
+++  PipelineConfig,
+++  ProjectConfig,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
+++
+++/**
+++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
+++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
+++ *
+++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
+++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
+++ * plan-review/architect/develop-family from their registered prompt input.
+++ */
+++
+++const ORCH = ".factory";
+++const TASK = "hydration-caps";
+++const agentsDir = path.resolve(import.meta.dir, "../../agents");
+++
+++type Hydrate = (
+++  taskDir: string,
+++  request: {
+++    stepRole: string;
+++    inputBytes?: number;
+++    diffBytes?: number;
+++    taskDiffBytes?: number;
+++    consumer?: string;
+++  }
+++) => Promise<string>;
+++type ListHydrated = (
+++  taskDir: string,
+++  consumer: string
+++) => Promise<Array<Record<string, any>>>;
+++
+++/**
+++ * New triage exports are looked up dynamically so this file collects against the
+++ * pre-implementation module and fails on behavior, not on a missing import.
+++ */
+++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
+++  const mod = triageModule as unknown as {
+++    hydrateStepConcerns?: Hydrate;
+++    listHydratedConcerns?: ListHydrated;
+++  };
+++  const hydrate = mod.hydrateStepConcerns;
+++  const list = mod.listHydratedConcerns;
+++  if (!hydrate || !list) {
+++    return {
+++      hydrate: (() => {
+++        throw new Error("hydrateStepConcerns is not implemented");
+++      }) as unknown as Hydrate,
+++      list: (() => {
+++        throw new Error("listHydratedConcerns is not implemented");
+++      }) as unknown as ListHydrated,
+++    };
+++  }
+++  return { hydrate, list };
+++}
+++
+++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
+++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
+++
+++describe("Hydration caps (adr-hydration-single-cap)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
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
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
+++    tmpRepo.commit("add hydration caps task");
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
+++        developer: { role: "workhorse" },
+++        reviewer: { role: "alt-workhorse" },
+++        qa: { role: "alt-workhorse" },
+++        architect: { role: "architect" },
+++        "plan-reviewer": { role: "alt-architect" },
+++        pm: { role: "alt-workhorse" },
+++        "wave-close-up": { role: "alt-workhorse" },
+++        "plan-close-up": { role: "alt-workhorse" },
+++      },
+++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+++      limits: { maxPlanReviewRounds: 1 },
+++    };
+++    project = { orchestrationFolder: ORCH, worktreeRoot };
+++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  function concernsDir() {
+++    return path.join(taskDir, "concerns");
+++  }
+++
+++  function concernFiles(prefix = "c-") {
+++    const dir = concernsDir();
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
+++    const harness = new FakeHarness();
+++    const label = `${TASK}/runs/review#a1`;
+++    harness.scriptOutcome(label, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${label}#relaunch`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
+++    return runAgentStep({
+++      task: TASK,
+++      stepId: "review",
+++      stepFragment: "steps/review",
+++      agent: "reviewer",
+++      cwd: taskWt,
+++      taskWt,
+++      taskDir,
+++      recordsDir: path.join(taskDir, "runs"),
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts: promptsFor,
+++      promptVars,
+++    }).then((result) => ({ result, harness }));
+++  }
+++
+++  function promptOf(harness: FakeHarness): string {
+++    const call = harness.calls.find((c) => c.type === "run");
+++    if (!call || call.type !== "run") throw new Error("no agent run captured");
+++    return call.run.prompt;
+++  }
+++
+++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-aaaaaaaaaa",
+++      kind: "risk",
+++      summary: "Retry loop can spin",
+++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++    await writeConcern({
+++      id: "c-bbbbbbbbbb",
+++      kind: "blocker",
+++      summary: "Missing adapter",
+++      detail: "e".repeat(600),
+++      severity: "medium",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-aaaaaaaaaa");
+++    expect(hydrated).toContain("Retry loop can spin");
+++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
+++    expect(yaml.parse(hydrated)).toHaveLength(2);
+++
+++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
+++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
+++    expect(small).toContain("c-");
+++  });
+++
+++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
+++    await writeConcern({
+++      id: "c-cccccccccc",
+++      kind: "tech-debt",
+++      summary: "Plan duplicates the retry helper",
+++      detail: "f".repeat(600),
+++      severity: "medium",
+++      affects: ["m1"],
+++    });
+++    await writeConcern({
+++      id: "c-dddddddddd",
+++      kind: "risk",
+++      summary: "Milestone boundary depends on an unbuilt adapter",
+++      detail: "g".repeat(600),
+++      severity: "high",
+++      affects: ["m1"],
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
+++    expect(hydrated).toContain("c-cccccccccc");
+++
+++    // Iteration 2+ has merged code on the branch: classification still uses the
+++    // registered prompt input, not a branch-state diff inference.
+++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
+++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
+++  });
+++
+++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-eeeeeeeeee",
+++      kind: "tech-debt",
+++      summary: "Shared helper duplicated in two modules",
+++      detail: "h".repeat(3000),
+++      severity: "medium",
+++    });
+++    await writeConcern({
+++      id: "c-ffffffffff",
+++      kind: "assumption",
+++      summary: "Cache survives restart",
+++      detail: "i".repeat(3000),
+++      severity: "low",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-eeeeeeeeee");
+++
+++    const planCloseup = await hydrate(taskDir, {
+++      stepRole: "plan-close-up",
+++      taskDiffBytes: 5000,
+++    });
+++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
+++  });
+++
+++  it("returns empty hydration for zero and tiny caps", async () => {
+++    await writeConcern({
+++      id: "c-1111111111",
+++      kind: "risk",
+++      summary: "Visible only when the cap allows bytes",
+++      detail: "j".repeat(600),
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(positive).not.toBe("");
+++    expect(idLines(positive).length).toBeGreaterThan(0);
+++
+++    for (const cap of [0, 1, 3]) {
+++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
+++      expect(empty).toBe("");
+++      expect(idLines(empty)).toEqual([]);
+++    }
+++  });
+++
+++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
+++    const summary = "Retry loop can spin";
+++    const cid = "c-2222222222";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary,
+++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++
+++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
+++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
+++    expect(promptOf(zero.harness)).not.toContain(cid);
+++
+++    const hydrated = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++    });
+++    const prompt = promptOf(hydrated.harness);
+++    expect(prompt).toContain(cid);
+++    expect(prompt).toContain(summary);
+++    expect(prompt).not.toContain("DETAIL_SENTINEL");
+++
+++    const supplied = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++      concernsYaml: "CALLER-CONCERNS: c-caller",
+++    });
+++    const suppliedPrompt = promptOf(supplied.harness);
+++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
+++    expect(suppliedPrompt).not.toContain(cid);
+++  });
+++
+++  it("computes close-up task diff bytes through the injected git function", async () => {
+++    const cid = "c-3333333333";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary: "Close-up concern",
+++      detail: "l".repeat(400),
+++      severity: "medium",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "wave-close-up.md"),
+++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
+++
+++    const gitCalls: string[][] = [];
+++    const gitFn = async (_cwd: string, args: string[]) => {
+++      gitCalls.push(args);
+++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
+++    };
+++    const harness = new FakeHarness();
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    try {
+++      await runAgentStep({
+++        task: TASK,
+++        stepId: "wave-close-up-1-1",
+++        stepFragment: "steps/wave-close-up",
+++        agent: "wave-close-up",
+++        cwd: taskWt,
+++        taskWt,
+++        taskDir,
+++        parentBranch: "topic/demo",
+++        recordsDir: path.join(taskDir, "runs"),
+++        repo,
+++        harness,
+++        pipeline,
+++        project,
+++        prompts: closeupPrompts,
+++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
+++        gitFn,
+++      } as any);
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
+++    const prompt = promptOf(harness);
+++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
+++    expect(block).toContain(cid);
+++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(block)).toBeLessThan(5000);
+++  });
+++
+++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
+++    const cid = "c-4444444444";
+++    await writeConcern({
+++      id: cid,
+++      kind: "blocker",
+++      summary: "Database schema migration is pending",
+++      detail: "m".repeat(400),
+++      severity: "high",
+++      status: "routed",
+++      disposition: "architect",
+++      affects: ["seed"],
+++    });
+++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
+++      id: "dec-1",
+++      context: "task",
+++      decision: "continue",
+++      rationale: "漢".repeat(120),
+++      timestamp: "2026-01-01T00:00:00.000Z",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "architect-plan.md"),
+++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const architectPrompts = loadPromptLibrary({
+++      builtinDir: agentsDir,
+++      overrideDirs: [overridesDir],
+++    });
+++
+++    const harness = new FakeHarness();
+++    let architectPrompt = "";
+++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
+++      architectPrompt = run.prompt;
+++      return {
+++        ok: true,
+++        data: {
+++          iteration: 1,
+++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
+++          itemOutlines: [],
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    try {
+++      await runIteration({
+++        task: TASK,
+++        taskDir,
+++        taskWt,
+++        repo,
+++        harness,
+++        pipeline: {
+++          ...pipeline,
+++          limits: {
+++            hydrationBytes: 20,
+++            maxPlanReviewRounds: 1,
+++            maxIterations: 3,
+++            maxParallelItems: 2,
+++            maxParallelTurns: 4,
+++            maxStepAttempts: 3,
+++            maxFixRounds: 3,
+++          },
+++        },
+++        project,
+++        prompts: architectPrompts,
+++      });
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(architectPrompt).toContain(cid);
+++    expect(occurrences(architectPrompt, cid)).toBe(1);
+++    expect(architectPrompt).not.toContain("--- Concerns ---");
+++
+++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
+++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
+++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
+++    expect(debt).not.toContain("\uFFFD");
+++    expect(steering).not.toContain("\uFFFD");
+++
+++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
+++    expect(concerns).toContain(cid);
+++  });
+++});
+++
+++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
+++  let tmpRepo: TmpRepo;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  async function writeRemarkable(
+++    id: string,
+++    chosen: string,
+++    overrides: Record<string, unknown> = {}
+++  ) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
+++      id,
+++      chosen,
+++      alternatives: ["Other"],
+++      why: "w".repeat(300),
+++      status: "open",
+++      source: { record: "001-architect-plan-a1", agent: "architect" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    });
+++  }
+++
+++  it("hydrates open concerns with pending resolutions for review", async () => {
+++    const pending = {
+++      action: "carry" as const,
+++      note: "Needs an architect decision",
+++      by: "wave-close-up",
+++      at: "2026-01-02T00:00:00.000Z",
+++    };
+++    await writeConcern({
+++      id: "c-5555555555",
+++      summary: "Needs a decision",
+++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
+++      pendingResolution: pending,
+++    });
+++
+++    const { list } = hydrationApi();
+++    for (const consumer of ["review", "develop", "qa"]) {
+++      const hydrated = await list(taskDir, consumer);
+++      expect(hydrated).toHaveLength(1);
+++      expect(hydrated[0]).toMatchObject({
+++        id: "c-5555555555",
+++        kind: "risk",
+++        summary: "Needs a decision",
+++        pendingResolution: pending,
+++      });
+++      expect(hydrated[0]).not.toHaveProperty("detail");
+++    }
+++  });
+++
+++  it("includes routed concerns for close-ups but not for review", async () => {
+++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
+++    await writeConcern({
+++      id: "c-7777777777",
+++      status: "routed",
+++      disposition: "architect",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
+++
+++    const closeup = await list(taskDir, "closeup");
+++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
+++  });
+++
+++  it("hydrates open remarkables as terse remarkable records", async () => {
+++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
+++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++  });
+++
+++  it("includes dismissed escalated concerns only in the architect set", async () => {
+++    await writeConcern({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      dismissReason: "not real",
+++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-ababababab",
+++      status: "dismissed",
+++      dismissReason: "quiet",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-acacacacac",
+++      status: "open",
+++      createdAt: "2026-01-03T00:00:00.000Z",
+++    });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
+++    expect(architect[0]).toMatchObject({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      escalated: true,
+++    });
+++  });
+++
+++  it("counts concerns only, never remarkables", async () => {
+++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
+++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
+++
+++    await writeConcern({ id: "c-adadadadad", status: "open" });
+++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
+++  });
+++});
+++
+++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
+++    taskWt = tmpRepo.dir;
+++    taskDir = path.join(taskWt, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function source(record = "001-develop-a1"): ConcernSource {
+++    return { record, agent: "developer" };
+++  }
+++
+++  function concernFiles() {
+++    const dir = path.join(taskDir, "concerns");
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
+++  function legacyFingerprint(input: {
+++    kind: string;
+++    summary: string;
+++    location?: { file: string; line?: number };
+++    affects?: string[];
+++  }): string {
+++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
+++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
+++    const parts = [
+++      input.kind,
+++      norm(input.summary),
+++      input.location?.file.trim() ?? null,
+++      input.location?.line ?? null,
+++      affects,
+++    ];
+++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+++  }
+++
+++  it("fingerprints kind, normalized summary, and location without affects", () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "  Flaky   GATE ",
+++      location: { file: "src/core/example.ts", line: 7 },
+++    };
+++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
+++
+++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
+++
+++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
+++    expect(
+++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+++    ).not.toBe(id);
+++  });
+++
+++  it("unions affects without forking and preserves terminal status", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Flaky gate blocks merges",
+++      location: { file: "src/core/merge.ts", line: 12 },
+++    };
+++    const id = concernFingerprint(identity);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source() },
+++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    let stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${id}.yaml`)
+++    );
+++    expect(stored.affects).toEqual(["item-a", "item-b"]);
+++    expect(stored.status).toBe("open");
+++    expect(stored.detail).toBe("a much longer detail");
+++    expect(stored.severity).toBe("high");
+++    expect(stored.source.escalated).toBe(true);
+++
+++    await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [
+++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
+++      ],
+++    });
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("003-review-a1") },
+++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
+++    expect(stored.status).toBe("dismissed");
+++    expect(stored.dismissReason).toBe("covered by ADR-1");
+++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
+++    expect(stored.source.escalated).toBe(true);
+++  });
+++
+++  it("renames a legacy affects-keyed file to the stable id", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Legacy concern",
+++      location: { file: "src/legacy.ts", line: 4 },
+++    };
+++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
+++    const stableId = concernFingerprint(identity);
+++    expect(legacyId).not.toBe(stableId);
+++
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
+++      id: legacyId,
+++      ...identity,
+++      detail: "legacy detail",
+++      severity: "medium",
+++      status: "open",
+++      affects: ["old"],
+++      source: { record: "000-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    expect(concernFiles()).toEqual([legacyId]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
+++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
+++    );
+++
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${stableId}.yaml`)
+++    );
+++    expect(stored.id).toBe(stableId);
+++    expect(stored.affects).toEqual(["new", "old"]);
+++    expect(stored.detail).toBe("new detail");
+++    expect(stored.severity).toBe("high");
+++
+++    // Re-emitting with another affect keeps the same stable triage id.
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, affects: ["new", "third"] }]
+++    );
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
+++  });
+++});
++diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++index fb7cc9b..df5eac8 100644
++--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++@@ -16,9 +16,9 @@ import {
++   concernMailboxId,
++   isDebtConcern,
++   partitionReviewSuggestions,
++-  renderConcernsYaml,
++   type ReviewTriageOutcome,
++ } from "../../src/core/triage.js";
+++import * as triageModule from "../../src/core/triage.js";
++ import type {
++   PipelineConfig,
++   ProjectConfig,
++@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         assignment: "Review the item",
++         checks: "",
++         testDiff: "",
++-        diff: "",
+++        diff: "d".repeat(3000),
++         dispositionsCriteria: "",
++       },
++     });
++@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++     expect(qa.fixRequired).toBe(false);
++   });
++ 
++-  it("renders condensing concern YAML without detail and within the byte cap", () => {
+++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
++     const concerns = [
++       storedConcern({
++         id: "c-aaaaaaaaaa",
++@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         detail: "e".repeat(600),
++       }),
++     ];
++-
++-    const rendered = renderConcernsYaml(concerns);
+++    for (const concern of concerns) await writeConcern(concern);
+++
+++    const hydrate = (
+++      triageModule as unknown as {
+++        hydrateStepConcerns?: (
+++          taskDir: string,
+++          request: { stepRole: string; diffBytes: number }
+++        ) => Promise<string>;
+++      }
+++    ).hydrateStepConcerns;
+++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
+++
+++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
++     const parsed = yaml.parse(rendered);
++     expect(Array.isArray(parsed)).toBe(true);
++     expect(parsed).toHaveLength(2);
++@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++       Buffer.byteLength(JSON.stringify(concerns), "utf8")
++     );
++ 
++-    const capped = renderConcernsYaml(concerns, 120);
+++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
++     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
++     expect(capped).not.toContain("\uFFFD");
++   });
++diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++index 3eb7799..58961a9 100644
++--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
++     prompts = loadPromptLibrary({
++       builtinDir: path.resolve(import.meta.dir, "../../agents"),
++       overrideDirs: [],
+++      // The single hydration source is concernsYaml; prompt fragments gain the
+++      // placeholder in the prompt-fragments item, so this test supplies it here.
+++      overrides: {
+++        "steps/architect-plan":
+++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
+++        "steps/architect-wave-report":
+++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
+++      },
++     });
++   });
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..7956d3a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-08T19:50:25.163Z
++session: 01a1bcb6-5653-7033-b9b4-41d98dfceafa
++endedAt: 2026-11-08T20:56:01.718Z
++usage:
++  inputTokens: 190650
++  outputTokens: 100837
++  costUsd: 0.050218
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-50-28-691Z_01a1bcb6-5653-7033-b9b4-41d98dfceafa
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..8f93e33
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
+@@ -0,0 +1,38 @@
++status: approved
++summary: Verified caps, sets, fingerprint-union, legacy rename; gates green; no
++  test weakening
++suggestions:
++  - id: develop-family-dormant-injection
++    disposition: optional
++    summary: "Develop-family hydration dormant: KNOWN_VARS lacks concernsYaml so
++      step-runner never injects"
++    detail: hydrateStepConcerns maps develop/test-first/fix-round/etc to 500B
++      inputBytes branch, but step-runner gates on
++      knownVars.includes(concernsYaml) and KNOWN_VARS for develop-family has no
++      concernsYaml entry. Path is correct per current fragments (no placeholder
++      to fill) but unexercised end-to-end; coordinate with prompt-fragments item
++      to register placeholder plus KNOWN_VARS, or document as intentional.
++    location:
++      file: plugins/software-factory/src/core/flows/step-runner.ts
++      line: 306
++  - id: legacy-multi-fork-merge
++    disposition: optional
++    summary: Legacy migration merges first match only; additional pre-union forks
++      would persist
++    detail: legacyConcern returns first same kind+normSummary+location file; once
++      stable file exists the scan is skipped, so hypothetical multiple
++      affects-keyed forks for one identity leave duplicates. Spec says singular
++      rename-merge with no GC, so compliant; consider merging all matches or
++      documenting single-merge sufficiency.
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 76
++  - id: test-dynamic-lookup-cleanup
++    disposition: optional
++    summary: Replace dynamic triage lookup with direct imports now implementation is
++      green
++    detail: New and updated tests access hydrateStepConcerns via dynamic namespace
++      cast to allow red-phase collection; now green, direct named imports would
++      simplify and catch signature drift at compile time. No behavior impact.
++    location:
++      file: plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md
+new file mode 100644
+index 0000000..87de7f5
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/input.md
+@@ -0,0 +1,4138 @@
++# Step: Review
++
++## Goal
++Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
++
++## Rules
++- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
++- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
++  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
++  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
++  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
++  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
++- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
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
++  "slug": "hydration-fingerprint-caps",
++  "kind": "dev",
++  "title": "Unified hydration, caps, fingerprint",
++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++  "outlineRef": "hydration-fingerprint-caps",
++  "milestone": "m1-hydration-prompts",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-hydration-prompts:1",
++    "m1-hydration-prompts:2",
++    "m1-hydration-prompts:3",
++    "m1-hydration-prompts:4",
++    "m1-hydration-prompts:6",
++    "m1-hydration-prompts:7"
++  ],
++  "citations": [
++    "docs/factory.v2.md:89-103",
++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++  ]
++}
++
++## Engine Checks
++
++
++## Code Diff
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..a228d4c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,57 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
+++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
+++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 14 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..edfeb92
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,66 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..3392505
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:23:15.847Z
+++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+++endedAt: 2026-11-08T19:38:59.292Z
+++usage:
+++  inputTokens: 190368
+++  outputTokens: 67345
+++  costUsd: 0.104286
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..bdc4fbc
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,103 @@
+++status: ok
+++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
+++  tests) covering the ADR contracts: step-role byte caps (review/qa
+++  min(diff,2000), close-ups min(taskDiff,2000),
+++  plan-review/architect/develop-family min(input,500)), '' semantics at
+++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
+++  rule, close-up taskDiff via injectable gitFn, architect hydration from
+++  concernsYaml without the removed duplicated '--- Concerns ---' section and
+++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
+++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
+++  affects-free fingerprint identity, affects union without forking incl.
+++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
+++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
+++  hydrates through the new API with a non-empty diff; architect routing tests
+++  supply the concernsYaml placeholder that the prompt-fragments item will add).
+++  Production code was left untouched; only test files changed. New production
+++  API is looked up dynamically so red failures are assertion/runtime failures in
+++  executed tests, not collection/import errors."
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
+++    compiles against current production; new options are passed through an
+++    explicit any-cast only in tests)."
+++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
+++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
+++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
+++    not on import/collection errors."
+++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
+++    --reporter=junit` -> suite collected; all 14 declared node ids present with
+++    status=fail (<failure>). Probe IDs match the runner's native
+++    `classname.name` form.
+++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
+++    fail (only the updated fingerprint test expecting affects-independent
+++    identity); confirms the suite collects after the test edit."
+++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
+++    fail (only the rewritten hydration-rendering test awaiting
+++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
+++    review hydration is exercised."
+++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
+++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
+++    routed, and the old open-only step-runner path cannot hydrate them without
+++    the removed buildArchitectHydration concerns section."
+++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
+++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
+++    hydration-fingerprint-caps.test.ts; no production files touched."
+++concerns:
+++  - The routing-architect-consult test now injects a minimal in-memory
+++    architect-plan/architect-wave-report override containing {{concernsYaml}},
+++    because builtin fragments gain that placeholder only in the separate
+++    prompt-fragments item. The override should be removable once that item
+++    lands.
+++  - Tests access the not-yet-existing triage exports through a dynamic namespace
+++    lookup so the suite collects and target-red failures are behavioral rather
+++    than import errors; once green, the lookup can be replaced by direct named
+++    imports.
+++  - One non-declared test in the new file ('counts concerns only, never
+++    remarkables') already passes because countConcerns is intentionally
+++    unchanged by this item.
+++notes: "Implementation plan for the green step is fully specified by the tests:
+++  add
+++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
+++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
+++  renderConcernsYaml with strict empty fallback; drop affects from
+++  concernFingerprint, union affects (including terminal statuses) with an
+++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
+++  scan with no GC; inject concernsYaml in step-runner only when caller
+++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
+++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
+++  via git(parentBranch...HEAD) with an injectable gitFn; delete
+++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
+++  without concerns."
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..410c83f
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,113 @@
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
+++        durationMs: 4842
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 86983
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+++          ----------------------------------------------------------------
+++          Blocking Questions:
+++            (none)
+++          ----------------------------------------------------------------
+++          Digest Questions:
+++            (none)
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
+++
+++           399 pass
+++           2 skip
+++           0 fail
+++           1893 expect() calls
+++          Ran 401 tests across 66 files. [86.84s]
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
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 224/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 163
+++        deleted: 61
+++        total: 224
+++        files:
+++          - plugins/software-factory/src/core/concerns.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++          - plugins/software-factory/src/core/flows/step-runner.ts
+++          - plugins/software-factory/src/core/triage.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..6bf3c27
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,85 @@
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
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/hydration-fingerprint-caps.test.ts"
+++  ],
+++  "expectRed": [
+++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
+++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
+++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
+++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
+++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
+++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
+++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
+++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
+++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
+++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
+++  ]
+++}
+++
+++## Context & Citations
+++[
+++  "docs/factory.v2.md:89-103",
+++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++  "plugins/software-factory/src/core/artifacts.ts:313-325"
+++]
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
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..2468de3
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
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
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:39:01.204Z
+++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
+++endedAt: 2026-11-08T19:48:44.187Z
+++usage:
+++  inputTokens: 104345
+++  outputTokens: 31138
+++  costUsd: 0.044819
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..f9624ec
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,69 @@
+++status: ok
+++summary: Implemented unified concern hydration with step-role byte caps,
+++  hydrated concern sets, and affects-independent fingerprints with legacy
+++  rename-merge. Triage now owns
+++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
+++  injects concernsYaml only when the caller does not supply it, computing
+++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
+++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
+++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
+++  deleted. Concerns merge now unions affects while preserving terminal status,
+++  and aggregate migrates legacy affects-keyed files to stable ids. All target
+++  tests, typecheck, and the full suite pass.
+++target:
+++  selectors:
+++    - test/engine/hydration-fingerprint-caps.test.ts
+++  expectRed:
+++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++      min(diffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
+++      min(inputBytes, 500) bytes
+++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
+++      min(taskDiffBytes, 2000) bytes
+++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
+++      and tiny caps
+++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
+++      diff bytes and lets caller-supplied values win
+++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++      bytes through the injected git function
+++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
+++      concernsYaml without a duplicate concerns section
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++      pending resolutions for review
+++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++      close-ups but not for review
+++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++      terse remarkable records
+++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++      concerns only in the architect set
+++    - Concern identity and affects union
+++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
+++      location without affects
+++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
+++      affects without forking and preserves terminal status
+++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
+++      a legacy affects-keyed file to the stable id
+++evidence:
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test
+++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
+++    expect() calls
+++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
+++    fail, 401 tests across 66 files (95.78s)
+++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
+++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
+++    deletions within prod budget
+++  - Manual diff review confirmed hydrateConcernsYaml removed, no
+++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
+++    no duplicate concerns section
+++concerns:
+++  - Legacy rename-merge intentionally treats the incoming detail as
+++    authoritative when migrating a pre-union-fingerprint file, while ordinary
+++    merges retain the longer stored detail per existing behavior.
+++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
+++    fragment, so custom unregistered fragments with a hand-added placeholder
+++    rely on caller-supplied concernsYaml.
+++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
+++  computation; iteration passes parentBranch to wave and plan close-ups.
+++  renderConcernsYaml now renders pre-shaped records and returns '' when no
+++  record fits the cap.
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..1fe7b7c
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/checks.yaml
++@@ -0,0 +1,53 @@
+++checks:
+++  - id: red-test
+++    status: pass
+++    message: "red-test passed: all 14 tests fail when prod changes are restored to
+++      test-first commit"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794167425243-3rnydh3yvvm.xml
+++      junitCaseCount: 15
+++      junitCaseIds:
+++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
+++          min(diffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
+++          at min(inputBytes, 500) bytes
+++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
+++          at min(taskDiffBytes, 2000) bytes
+++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
+++          zero and tiny caps
+++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
+++          by diff bytes and lets caller-supplied values win
+++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
+++          bytes through the injected git function
+++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
+++          from concernsYaml without a duplicate concerns section
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
+++          pending resolutions for review
+++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
+++          close-ups but not for review
+++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
+++          terse remarkable records
+++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
+++          concerns only in the architect set
+++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
+++          remarkables
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
+++          and location without affects
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).unions affects without forking and
+++          preserves terminal status
+++        - Concern identity and affects union
+++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
+++          the stable id
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: test-diff
+++    status: pass
+++    message: test-diff generated (0 test files, 0 bytes)
+++    details:
+++      diff: ""
+++      files: []
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
++new file mode 100644
++index 0000000..83f6b95
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/input.md
++@@ -0,0 +1,2003 @@
+++# Step: QA
+++
+++## Goal
+++Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
+++
+++## Rules
+++- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
+++- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
+++- Story kind validation:
+++  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
+++  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
+++- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+++
+++## Dispositions Criteria
+++Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
+++Use ONLY these dispositions; any other disposition value fails validation.
+++# Review Suggestion Dispositions
+++
+++Criteria for assigning disposition to review findings:
+++
+++| Disposition | When to Assign | Engine Action |
+++|---|---|---|
+++| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+++| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+++| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+++| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+++| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+++
+++## Rules
+++- Defect requiring code change MUST be `fix`.
+++- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+++- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+++
+++## Assignment
+++{
+++  "slug": "hydration-fingerprint-caps",
+++  "kind": "dev",
+++  "title": "Unified hydration, caps, fingerprint",
+++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
+++  "outlineRef": "hydration-fingerprint-caps",
+++  "milestone": "m1-hydration-prompts",
+++  "wave": 1,
+++  "scenarioRefs": [
+++    "m1-hydration-prompts:1",
+++    "m1-hydration-prompts:2",
+++    "m1-hydration-prompts:3",
+++    "m1-hydration-prompts:4",
+++    "m1-hydration-prompts:6",
+++    "m1-hydration-prompts:7"
+++  ],
+++  "citations": [
+++    "docs/factory.v2.md:89-103",
+++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
+++    "plugins/software-factory/src/core/artifacts.ts:313-325"
+++  ]
+++}
+++
+++## Engine Checks
+++
+++
+++## Test Diff
+++
+++
+++## Code Diff
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+++new file mode 100644
+++index 0000000..a228d4c
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/checks.yaml
+++@@ -0,0 +1,57 @@
++++checks:
++++  - id: test-first-scope
++++    status: pass
++++    message: test-first-scope passed (4 test files, 0 new prod stubs with 0 lines)
++++    details:
++++      testFiles:
++++        - plugins/software-factory/test/engine/concerns-funnel.test.ts
++++        - plugins/software-factory/test/engine/reviewer-triage.test.ts
++++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++++        - plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++++      newProdFiles: []
++++      stubProdLines: 0
++++  - id: target-red
++++    status: pass
++++    message: "target-red passed: all 14 expected tests failed with assertion failures"
++++    details:
++++      command: cd plugins/software-factory && bun test
++++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794166738122-tj96bg9xm8m.xml
++++      junitCaseCount: 15
++++      junitCaseIds:
++++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++++          min(diffBytes, 2000) bytes
++++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++++          at min(inputBytes, 500) bytes
++++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++++          at min(taskDiffBytes, 2000) bytes
++++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++++          zero and tiny caps
++++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++++          by diff bytes and lets caller-supplied values win
++++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++++          bytes through the injected git function
++++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++++          from concernsYaml without a duplicate concerns section
++++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++++          pending resolutions for review
++++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++++          close-ups but not for review
++++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++++          terse remarkable records
++++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++++          concerns only in the architect set
++++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++++          remarkables
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++++          and location without affects
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).unions affects without forking and
++++          preserves terminal status
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++++          the stable id
++++      junitTruncated: false
++++      collected: true
++++      collectionErrors: []
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+++new file mode 100644
+++index 0000000..edfeb92
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/input.md
+++@@ -0,0 +1,66 @@
++++# Step: Test-First
++++
++++## Goal
++++Author automated tests specifying the required behavior changes BEFORE writing production code.
++++
++++## Rules
++++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++++- Target declaration in yield:
++++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++++- Output: yield structured output per `developer-output.schema.json`.
++++
++++## Assignment
++++{
++++  "slug": "hydration-fingerprint-caps",
++++  "kind": "dev",
++++  "title": "Unified hydration, caps, fingerprint",
++++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++++  "outlineRef": "hydration-fingerprint-caps",
++++  "milestone": "m1-hydration-prompts",
++++  "wave": 1,
++++  "scenarioRefs": [
++++    "m1-hydration-prompts:1",
++++    "m1-hydration-prompts:2",
++++    "m1-hydration-prompts:3",
++++    "m1-hydration-prompts:4",
++++    "m1-hydration-prompts:6",
++++    "m1-hydration-prompts:7"
++++  ],
++++  "citations": [
++++    "docs/factory.v2.md:89-103",
++++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++++  ]
++++}
++++
++++## Context & Citations
++++[
++++  "docs/factory.v2.md:89-103",
++++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++++  "plugins/software-factory/src/core/artifacts.ts:313-325"
++++]
++++
++++## Review Feedback
++++
++++## Output
++++
++++Yield a structured JSON object matching this schema:
++++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++++- summary (string, required): Concise summary of implementation actions and test results
++++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++++  - Option 1:
++++    - selectors (array of string, required)
++++    - expectRed (array of string, required, minItems: 1)
++++  - Option 2:
++++    - gate (string, required)
++++  - Option 3:
++++    - command (string, required)
++++    - customTarget (boolean, required)
++++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++++- notes (string, optional): Optional developer notes, implementation observations, or comments
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
+++new file mode 100644
+++index 0000000..3392505
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/meta.yaml
+++@@ -0,0 +1,19 @@
++++seq: 1
++++name: test-first
++++attempt: 1
++++fixRound: 1
++++agent: developer
++++role: workhorse
++++models:
++++  - opencode-go/deepseek-v4.1-flash
++++  - opencode-go/muse-spark-1.3-contributor
++++timeoutSec: 5400
++++status: ok
++++startedAt: 2026-11-08T19:23:15.847Z
++++session: 01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
++++endedAt: 2026-11-08T19:38:59.292Z
++++usage:
++++  inputTokens: 190368
++++  outputTokens: 67345
++++  costUsd: 0.104286
++++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-23-16-817Z_01a1bc9d-6fd1-73fb-9bac-c60d54c9eec2
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+++new file mode 100644
+++index 0000000..bdc4fbc
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/001-test-first-r1-a1/output.yaml
+++@@ -0,0 +1,103 @@
++++status: ok
++++summary: "Authored test/engine/hydration-fingerprint-caps.test.ts (15 behavior
++++  tests) covering the ADR contracts: step-role byte caps (review/qa
++++  min(diff,2000), close-ups min(taskDiff,2000),
++++  plan-review/architect/develop-family min(input,500)), '' semantics at
++++  0/1/3-byte caps, step-runner diff-based injection plus caller-supplied skip
++++  rule, close-up taskDiff via injectable gitFn, architect hydration from
++++  concernsYaml without the removed duplicated '--- Concerns ---' section and
++++  UTF-8-capped debt/steering, per-consumer hydrated sets (open/pending, closeup
++++  routed, architect dismissed+escalated, rm-* terse shape), c-*-only counts,
++++  affects-free fingerprint identity, affects union without forking incl.
++++  terminal status, and legacy affects-keyed rename-merge. Updated three existing
++++  tests to the new contracts (fingerprint ignores affects; reviewer rendering
++++  hydrates through the new API with a non-empty diff; architect routing tests
++++  supply the concernsYaml placeholder that the prompt-fragments item will add).
++++  Production code was left untouched; only test files changed. New production
++++  API is looked up dynamically so red failures are assertion/runtime failures in
++++  executed tests, not collection/import errors."
++++target:
++++  selectors:
++++    - test/engine/hydration-fingerprint-caps.test.ts
++++  expectRed:
++++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++++      min(diffBytes, 2000) bytes
++++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++++      min(inputBytes, 500) bytes
++++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++++      min(taskDiffBytes, 2000) bytes
++++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++++      and tiny caps
++++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++++      diff bytes and lets caller-supplied values win
++++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++++      bytes through the injected git function
++++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++++      concernsYaml without a duplicate concerns section
++++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++++      pending resolutions for review
++++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++++      close-ups but not for review
++++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++++      terse remarkable records
++++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++++      concerns only in the architect set
++++    - Concern identity and affects union
++++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++++      location without affects
++++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++++      affects without forking and preserves terminal status
++++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++++      a legacy affects-keyed file to the stable id
++++evidence:
++++  - "`cd plugins/software-factory && bun run typecheck` -> exit 0 (test code
++++    compiles against current production; new options are passed through an
++++    explicit any-cast only in tests)."
++++  - "`TMPDIR=/tmp bun test test/engine/hydration-fingerprint-caps.test.ts` -> 15
++++    tests run, 1 pass / 14 fail; the 14 declared tests fail on missing
++++    hydrateStepConcerns/listHydratedConcerns or on old fingerprint/cap behavior,
++++    not on import/collection errors."
++++  - JUnit probe via `bun test test/engine/hydration-fingerprint-caps.test.ts
++++    --reporter=junit` -> suite collected; all 14 declared node ids present with
++++    status=fail (<failure>). Probe IDs match the runner's native
++++    `classname.name` form.
++++  - "`TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts` -> 21 pass / 1
++++    fail (only the updated fingerprint test expecting affects-independent
++++    identity); confirms the suite collects after the test edit."
++++  - "`TMPDIR=/tmp bun test test/engine/reviewer-triage.test.ts` -> 10 pass / 1
++++    fail (only the rewritten hydration-rendering test awaiting
++++    hydrateStepConcerns); prompt hydration test now supplies a 3000-byte diff so
++++    review hydration is exercised."
++++  - "`TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts` -> 0
++++    pass / 2 fail as expected-red for the new architect set: seeded concerns are
++++    routed, and the old open-only step-runner path cannot hydrate them without
++++    the removed buildArchitectHydration concerns section."
++++  - "`git status --short` -> only test files modified: concerns-funnel.test.ts,
++++    reviewer-triage.test.ts, routing-architect-consult.test.ts, plus new
++++    hydration-fingerprint-caps.test.ts; no production files touched."
++++concerns:
++++  - The routing-architect-consult test now injects a minimal in-memory
++++    architect-plan/architect-wave-report override containing {{concernsYaml}},
++++    because builtin fragments gain that placeholder only in the separate
++++    prompt-fragments item. The override should be removable once that item
++++    lands.
++++  - Tests access the not-yet-existing triage exports through a dynamic namespace
++++    lookup so the suite collects and target-red failures are behavioral rather
++++    than import errors; once green, the lookup can be replaced by direct named
++++    imports.
++++  - One non-declared test in the new file ('counts concerns only, never
++++    remarkables') already passes because countConcerns is intentionally
++++    unchanged by this item.
++++notes: "Implementation plan for the green step is fully specified by the tests:
++++  add
++++  triage.hydrateStepConcerns({stepRole,inputBytes?,diffBytes?,taskDiffBytes?,co\
++++  nsumer}) + triage.listHydratedConcerns(taskDir,consumer) and a records-based
++++  renderConcernsYaml with strict empty fallback; drop affects from
++++  concernFingerprint, union affects (including terminal statuses) with an
++++  affects-aware dirty pick, add legacy same-kind/summary/location rename-merge
++++  scan with no GC; inject concernsYaml in step-runner only when caller
++++  promptVars lack it, computing diff bytes, KNOWN_VARS input bytes (excluding
++++  concernsYaml/humanInvolvementCriteria/debt/steering), and close-up taskDiff
++++  via git(parentBranch...HEAD) with an injectable gitFn; delete
++++  hydrateConcernsYaml and make iteration's buildArchitectHydration UTF-8-capped
++++  without concerns."
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+++new file mode 100644
+++index 0000000..410c83f
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/checks.yaml
+++@@ -0,0 +1,113 @@
++++checks:
++++  - id: gates
++++    status: pass
++++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
++++      (§7).detects when an agent commits and resets --soft to before.sha,
++++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
++++      agent switches branch and restores original branch, keeping changes)"
++++    details:
++++      - id: typecheck
++++        command: cd plugins/software-factory && bun run typecheck
++++        status: pass
++++        durationMs: 4842
++++        details: $ tsc --noEmit
++++      - id: test
++++        command: cd plugins/software-factory && bun test
++++        status: pass
++++        durationMs: 86983
++++        details: |-
++++          bun test v1.4.3 (c6da4a4d3)
++++          ================================================================
++++          Task: status-test-task [ACTIVE]
++++          Kind: unclassified | Iteration: 1 | Wave: 1
++++          Worktree: (none - main checkout)
++++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-uqQUSR/.factory/pipeline.yaml
++++          Budget spent: $0.0000
++++          ----------------------------------------------------------------
++++          Waves & Items:
++++            Wave 1:
++++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++++          ----------------------------------------------------------------
++++          Blocking Questions:
++++            (none)
++++          ----------------------------------------------------------------
++++          Digest Questions:
++++            (none)
++++          ================================================================
++++
++++
++++          test/cli/cli.test.ts:
++++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 2445226
++++
++++           399 pass
++++           2 skip
++++           0 fail
++++           1893 expect() calls
++++          Ran 401 tests across 66 files. [86.84s]
++++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
++++        improvements:
++++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++++            and resets --soft to before.sha, keeping changes staged"
++++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++++            branch and restores original branch, keeping changes"
++++  - id: target-green
++++    status: pass
++++    message: "target-green passed: selected tests passed"
++++    details:
++++      command: cd plugins/software-factory && bun test
++++        test/engine/hydration-fingerprint-caps.test.ts --reporter=junit
++++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794167322564-vet1yejp31.xml
++++      junitCaseCount: 15
++++      junitCaseIds:
++++        - Hydration caps (adr-hydration-single-cap).caps review hydration at
++++          min(diffBytes, 2000) bytes
++++        - Hydration caps (adr-hydration-single-cap).caps plan-review hydration
++++          at min(inputBytes, 500) bytes
++++        - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration
++++          at min(taskDiffBytes, 2000) bytes
++++        - Hydration caps (adr-hydration-single-cap).returns empty hydration for
++++          zero and tiny caps
++++        - Hydration caps (adr-hydration-single-cap).injects review concernsYaml
++++          by diff bytes and lets caller-supplied values win
++++        - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++++          bytes through the injected git function
++++        - Hydration caps (adr-hydration-single-cap).hydrates architect turns
++++          from concernsYaml without a duplicate concerns section
++++        - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++++          pending resolutions for review
++++        - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++++          close-ups but not for review
++++        - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++++          terse remarkable records
++++        - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++++          concerns only in the architect set
++++        - Hydrated concern sets (adr-hydrated-sets).counts concerns only, never
++++          remarkables
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).fingerprints kind, normalized summary,
++++          and location without affects
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).unions affects without forking and
++++          preserves terminal status
++++        - Concern identity and affects union
++++          (adr-fingerprint-affects-union).renames a legacy affects-keyed file to
++++          the stable id
++++      junitTruncated: false
++++      collected: true
++++      collectionErrors: []
++++  - id: size
++++    status: pass
++++    message: "size passed: 224/300 production lines changed"
++++    details:
++++      changedLines:
++++        added: 163
++++        deleted: 61
++++        total: 224
++++        files:
++++          - plugins/software-factory/src/core/concerns.ts
++++          - plugins/software-factory/src/core/flows/iteration.ts
++++          - plugins/software-factory/src/core/flows/step-runner.ts
++++          - plugins/software-factory/src/core/triage.ts
++++      limit: 300
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+++new file mode 100644
+++index 0000000..6bf3c27
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/input.md
+++@@ -0,0 +1,85 @@
++++# Step: Develop
++++
++++## Goal
++++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++++
++++## Rules
++++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++++
++++## Assignment
++++{
++++  "slug": "hydration-fingerprint-caps",
++++  "kind": "dev",
++++  "title": "Unified hydration, caps, fingerprint",
++++  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
++++  "outlineRef": "hydration-fingerprint-caps",
++++  "milestone": "m1-hydration-prompts",
++++  "wave": 1,
++++  "scenarioRefs": [
++++    "m1-hydration-prompts:1",
++++    "m1-hydration-prompts:2",
++++    "m1-hydration-prompts:3",
++++    "m1-hydration-prompts:4",
++++    "m1-hydration-prompts:6",
++++    "m1-hydration-prompts:7"
++++  ],
++++  "citations": [
++++    "docs/factory.v2.md:89-103",
++++    "plugins/software-factory/src/core/fingerprint.ts:20-50",
++++    "plugins/software-factory/src/core/artifacts.ts:313-325"
++++  ]
++++}
++++
++++## Target
++++{
++++  "selectors": [
++++    "test/engine/hydration-fingerprint-caps.test.ts"
++++  ],
++++  "expectRed": [
++++    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
++++    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
++++    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
++++    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
++++    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
++++    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
++++    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
++++    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
++++    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
++++    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
++++    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
++++    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
++++    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
++++    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
++++  ]
++++}
++++
++++## Context & Citations
++++[
++++  "docs/factory.v2.md:89-103",
++++  "plugins/software-factory/src/core/fingerprint.ts:20-50",
++++  "plugins/software-factory/src/core/artifacts.ts:313-325"
++++]
++++
++++## Review Feedback
++++
++++## Output
++++
++++Yield a structured JSON object matching this schema:
++++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++++- summary (string, required): Concise summary of implementation actions and test results
++++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++++  - Option 1:
++++    - selectors (array of string, required)
++++    - expectRed (array of string, required, minItems: 1)
++++  - Option 2:
++++    - gate (string, required)
++++  - Option 3:
++++    - command (string, required)
++++    - customTarget (boolean, required)
++++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++++- notes (string, optional): Optional developer notes, implementation observations, or comments
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
+++new file mode 100644
+++index 0000000..2468de3
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/meta.yaml
+++@@ -0,0 +1,19 @@
++++seq: 2
++++name: develop
++++attempt: 1
++++fixRound: 1
++++agent: developer
++++role: workhorse
++++models:
++++  - opencode-go/deepseek-v4.1-flash
++++  - opencode-go/muse-spark-1.3-contributor
++++timeoutSec: 5400
++++status: ok
++++startedAt: 2026-11-08T19:39:01.204Z
++++session: 01a1bcab-da8c-74db-bd5f-812a4e39a2cd
++++endedAt: 2026-11-08T19:48:44.187Z
++++usage:
++++  inputTokens: 104345
++++  outputTokens: 31138
++++  costUsd: 0.044819
++++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-39-01-644Z_01a1bcab-da8c-74db-bd5f-812a4e39a2cd.jsonl
+++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+++new file mode 100644
+++index 0000000..f9624ec
+++--- /dev/null
++++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/002-develop-r1-a1/output.yaml
+++@@ -0,0 +1,69 @@
++++status: ok
++++summary: Implemented unified concern hydration with step-role byte caps,
++++  hydrated concern sets, and affects-independent fingerprints with legacy
++++  rename-merge. Triage now owns
++++  hydrateStepConcerns/listHydratedConcerns/renderConcernsYaml; step-runner
++++  injects concernsYaml only when the caller does not supply it, computing
++++  review/qa diff bytes, close-up task-diff bytes via injectable gitFn, and
++++  planning input bytes from KNOWN_VARS. Iteration supplies close-up parentBranch
++++  and architect hydration no longer duplicates concerns; hydrateConcernsYaml was
++++  deleted. Concerns merge now unions affects while preserving terminal status,
++++  and aggregate migrates legacy affects-keyed files to stable ids. All target
++++  tests, typecheck, and the full suite pass.
++++target:
++++  selectors:
++++    - test/engine/hydration-fingerprint-caps.test.ts
++++  expectRed:
++++    - Hydration caps (adr-hydration-single-cap).caps review hydration at
++++      min(diffBytes, 2000) bytes
++++    - Hydration caps (adr-hydration-single-cap).caps plan-review hydration at
++++      min(inputBytes, 500) bytes
++++    - Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at
++++      min(taskDiffBytes, 2000) bytes
++++    - Hydration caps (adr-hydration-single-cap).returns empty hydration for zero
++++      and tiny caps
++++    - Hydration caps (adr-hydration-single-cap).injects review concernsYaml by
++++      diff bytes and lets caller-supplied values win
++++    - Hydration caps (adr-hydration-single-cap).computes close-up task diff
++++      bytes through the injected git function
++++    - Hydration caps (adr-hydration-single-cap).hydrates architect turns from
++++      concernsYaml without a duplicate concerns section
++++    - Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with
++++      pending resolutions for review
++++    - Hydrated concern sets (adr-hydrated-sets).includes routed concerns for
++++      close-ups but not for review
++++    - Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as
++++      terse remarkable records
++++    - Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated
++++      concerns only in the architect set
++++    - Concern identity and affects union
++++      (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and
++++      location without affects
++++    - Concern identity and affects union (adr-fingerprint-affects-union).unions
++++      affects without forking and preserves terminal status
++++    - Concern identity and affects union (adr-fingerprint-affects-union).renames
++++      a legacy affects-keyed file to the stable id
++++evidence:
++++  - cd plugins/software-factory && TMPDIR=/tmp bun test
++++    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
++++    expect() calls
++++  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
++++  - cd plugins/software-factory && TMPDIR=/tmp bun test -> 399 pass, 2 skip, 0
++++    fail, 401 tests across 66 files (95.78s)
++++  - git diff --stat -> only src/core/concerns.ts, src/core/flows/iteration.ts,
++++    src/core/flows/step-runner.ts, src/core/triage.ts changed; 163 insertions/61
++++    deletions within prod budget
++++  - Manual diff review confirmed hydrateConcernsYaml removed, no
++++    prompt-fragment/router/epic/ingest changes, and architect hydration contains
++++    no duplicate concerns section
++++concerns:
++++  - Legacy rename-merge intentionally treats the incoming detail as
++++    authoritative when migrating a pre-union-fingerprint file, while ordinary
++++    merges retain the longer stored detail per existing behavior.
++++  - Hydration injection is gated on KNOWN_VARS registering concernsYaml for the
++++    fragment, so custom unregistered fragments with a hand-added placeholder
++++    rely on caller-supplied concernsYaml.
++++notes: Step-runner accepts parentBranch and gitFn for close-up task-diff byte
++++  computation; iteration passes parentBranch to wave and plan close-ups.
++++  renderConcernsYaml now renders pre-shaped records and returns '' when no
++++  record fits the cap.
+++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+++index 5e2078d..197bc81 100644
+++--- a/plugins/software-factory/src/core/concerns.ts
++++++ b/plugins/software-factory/src/core/concerns.ts
+++@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
+++ const hash = (prefix: string, parts: unknown[]) =>
+++   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+++ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+++-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
+++ 
+++-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++++/** Stable concern identity: kind, normalized summary, location. */
+++ export function concernFingerprint(c: ConcernInput): string {
+++-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
+++ }
+++ 
+++ async function readExisting<T>(file: string): Promise<T | undefined> {
+++@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
+++   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+++   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+++   const location = input.location ?? existing?.location;
+++-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++++  const affects = input.affects
++++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
++++    : existing?.affects;
+++   return {
+++     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+++     summary: existing?.summary ?? input.summary.trim(), detail,
+++@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
+++   };
+++ }
+++ 
++++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
++++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
++++  let names: string[];
++++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++++    if (err?.code === "ENOENT") return undefined;
++++    throw err;
++++  }
++++  const [file, line] = locationOf(input.location);
++++  for (const name of names.sort()) {
++++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
++++    const candidate = path.join(dir, name);
++++    try {
++++      const record = await readYaml<StoredConcernArtifact>(candidate);
++++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
++++      const [rfile, rline] = locationOf(record.location);
++++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
++++      return { file: candidate, record };
++++    } catch { /* Corrupt entries are not migration candidates. */ }
++++  }
++++  return undefined;
++++}
++++
+++ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+++ export async function aggregateConcerns(
+++   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
+++@@ -85,10 +110,17 @@ export async function aggregateConcerns(
+++     const out: StoredConcernArtifact[] = [];
+++     for (const input of concerns) {
+++       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+++-      const existing = await readExisting<StoredConcernArtifact>(file);
++++      let existing = await readExisting<StoredConcernArtifact>(file);
++++      let legacyFile: string | undefined;
++++      if (!existing) {
++++        const migrated = await legacyConcern(dir, input);
++++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
++++      }
+++       const merged = mergeConcern(existing, input, ctx.source, at);
+++-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
++++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+++       await writeYamlAtomic(file, merged);
++++      if (legacyFile) await fs.promises.unlink(legacyFile);
+++       dirty = true; out.push(merged);
+++     }
+++     for (const decision of remarkables) {
+++@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
+++   }
+++ }
+++ 
+++-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+++-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+++-  const dir = dirOf(taskDir);
+++-  let names: string[];
+++-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++-    if (err?.code === "ENOENT") return "[]";
+++-    throw err;
+++-  }
+++-  const items = await Promise.all(
+++-    names
+++-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+++-      .map(async (name) => {
+++-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+++-      })
+++-  );
+++-  const open = items
+++-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+++-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+++-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+++-}
+++-
+++ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+++   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+++   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+++index 84a77f6..0cc7f10 100644
+++--- a/plugins/software-factory/src/core/flows/iteration.ts
++++++ b/plugins/software-factory/src/core/flows/iteration.ts
+++@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
+++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+++ import {
+++-  hydrateConcernsYaml,
+++   listConcernIds,
+++   listConcerns,
+++   partitionSuggestions,
+++ } from "../concerns.js";
+++-import { renderConcernsYaml } from "../triage.js";
+++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+++ import { validateEdits } from "../plan/limits.js";
+++ import { applyEdits } from "../plan/apply.js";
+++@@ -169,23 +167,13 @@ async function buildArchitectHydration(
+++     }
+++   }
+++ 
+++-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+++-  // every architect turn the terse decision context the act phase acts on.
+++-  // Appended last so the byte cap never evicts it.
+++-  const actionableConcerns = (await listConcerns(taskDir)).filter(
+++-    (c) => c.status === "open" || c.status === "routed"
+++-  );
+++-  if (actionableConcerns.length > 0) {
+++-    parts.push(
+++-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+++-    );
+++-  }
+++-
++++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
+++   const combined = parts.join("\n\n");
+++-  if (combined.length <= maxBytes) {
+++-    return combined;
+++-  }
+++-  return combined.slice(combined.length - maxBytes);
++++  const buf = Buffer.from(combined, "utf8");
++++  if (buf.length <= maxBytes) return combined;
++++  let start = buf.length - maxBytes;
++++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
++++  return buf.subarray(start).toString("utf8");
+++ }
+++ 
+++ /**
+++@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+++     // Triage ids are those that existed before this review round; capturing
+++     // them here mirrors the step-runner exact-id partition.
+++     const knownConcernIds = await listConcernIds(taskDir);
+++-    const concernsYaml = await hydrateConcernsYaml(taskDir);
+++     // Check if review round record already exists
+++     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+++     const revStepRes = await runAgentStep({
+++@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+++         plan: JSON.stringify(plan, null, 2),
+++         intent: intentText,
+++         context: contextYaml,
+++-        concernsYaml,
+++         limits: JSON.stringify(limits, null, 2),
+++         dispositionsCriteria: formatDispositionsSection(
+++           loadCriteriaBundle(pipeline.criteria).dispositions,
+++@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+++         waveReport: waveSummary,
+++         infra: infraYaml,
+++       },
++++      parentBranch,
+++       turnsSemaphore,
+++       budgetTracker,
+++       iteration,
+++@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+++       plan: JSON.stringify(plan, null, 2),
+++       context: contextYaml,
+++     },
++++    parentBranch,
+++     turnsSemaphore,
+++     budgetTracker,
+++     iteration,
+++diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+++index 3b158c4..69fba68 100644
+++--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+++@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+++ import {
+++   aggregateConcerns,
+++   applyCloseupResolutions,
+++-  listOpenConcerns,
+++ } from "../concerns.js";
+++ import {
+++   applyReviewTriage,
+++-  renderConcernsYaml,
++++  hydrateStepConcerns,
+++   TriageValidationError,
+++   type ReviewTriageOutcome,
+++ } from "../triage.js";
++++import { KNOWN_VARS } from "../prompt-vars.js";
+++ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+++ import { captureHead, enforceHead } from "../git/guard.js";
+++ import { commitAll } from "../git/commit.js";
+++@@ -70,6 +70,8 @@ export interface StepRunOptions {
+++   project: ProjectConfig;
+++   prompts: any;
+++   promptVars: Record<string, string>;
++++  parentBranch?: string;
++++  gitFn?: typeof git;
+++   turnsSemaphore?: Semaphore;
+++   customSchema?: JSONSchema;
+++   log?: (msg: string) => void;
+++@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+++   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+++   const fragment = stepFragment ?? `steps/${stepId}`;
+++   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+++-  const openConcerns = await listOpenConcerns(taskDir);
+++-  const concernsYaml = openConcerns.length > 0
+++-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
+++-    : "";
+++   const effectivePromptVars: Record<string, string> = {
+++     humanInvolvementCriteria: formatHumanInvolvementCriteria(
+++       criteriaBundle.humanInvolvement,
+++       pipeline.humanInvolvement
+++     ),
+++-    concernsYaml,
+++     ...promptVars,
+++   };
++++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
++++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
++++    const stepRole = fragment.replace(/^steps\//, "");
++++    if (stepRole === "review" || stepRole === "qa") {
++++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++++        stepRole,
++++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
++++      });
++++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
++++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
++++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++++        stepRole,
++++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
++++      });
++++    } else {
++++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
++++      const inputBytes = knownVars
++++        .filter((key) => !excluded.has(key))
++++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
++++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
++++    }
++++  }
+++   let promptText: string;
+++   let agentDef: { body: string; tools: string[]; description: string };
+++   try {
+++diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
+++index 923a9d1..479287e 100644
+++--- a/plugins/software-factory/src/core/triage.ts
++++++ b/plugins/software-factory/src/core/triage.ts
+++@@ -1,7 +1,10 @@
++++import fs from "node:fs";
++++import path from "node:path";
+++ import yaml from "yaml";
+++ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+++-import { applyConcernTriage } from "./concerns.js";
++++import { applyConcernTriage, listConcerns } from "./concerns.js";
+++ import type { Repo } from "./git/repo.js";
++++import { readYaml } from "./records/io.js";
+++ import { writeQuestion } from "./steer.js";
+++ 
+++ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
+++@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
+++     severity: c.severity,
+++     summary: c.summary,
+++     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
++++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
++++    ...(c.status !== "open" ? { status: c.status } : {}),
++++    ...(c.disposition ? { disposition: c.disposition } : {}),
++++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
++++    ...(c.source?.escalated ? { escalated: true } : {}),
+++   };
+++ }
+++ 
++++export interface HydrateStepConcernsRequest {
++++  stepRole: string;
++++  inputBytes?: number;
++++  diffBytes?: number;
++++  taskDiffBytes?: number;
++++  consumer?: string;
++++}
++++
+++ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+++ const serialize = (records: Array<Record<string, unknown>>) =>
+++   yaml.stringify(records, { lineWidth: 0 });
+++ const truncateChars = (text: string, max: number) =>
+++   Array.from(text).slice(0, max).join("");
+++ 
++++/** Normalizes step ids/fragments to their hydration role family. */
++++function hydrationRole(stepRole: string): string {
++++  const role = stepRole.replace(/^steps\//, "");
++++  if (role === "architect" || role.startsWith("architect-")) return "architect";
++++  if (role.startsWith("plan-review")) return "plan-review";
++++  if (role.startsWith("plan-close-up")) return "plan-close-up";
++++  if (role.startsWith("wave-close-up")) return "wave-close-up";
++++  if (role === "review" || role === "qa") return role;
++++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
++++  return role;
++++}
++++
++++function hydrationConsumer(role: string, consumer?: string): string {
++++  if (consumer) return consumer;
++++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
++++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
++++  return role === "architect" ? "architect" : role;
++++}
++++
++++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
++++  const dir = path.join(taskDir, "concerns");
++++  let names: string[];
++++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
++++    throw err;
++++  }
++++  const records = await Promise.all(
++++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
++++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++++    })
++++  );
++++  return records
++++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
++++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
++++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
++++}
++++
++++/** Hydrated concern set per consumer (adr-hydrated-sets). */
++++export async function listHydratedConcerns(
++++  taskDir: string,
++++  consumer: string
++++): Promise<Array<Record<string, unknown>>> {
++++  const includeRouted = consumer === "closeup" || consumer === "architect";
++++  const includeEscalated = consumer === "architect";
++++  const concerns = (await listConcerns(taskDir)).filter((c) =>
++++    c.status === "open" ||
++++    (includeRouted && c.status === "routed") ||
++++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
++++  );
++++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
++++}
++++
++++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
++++export async function hydrateStepConcerns(
++++  taskDir: string,
++++  request: HydrateStepConcernsRequest
++++): Promise<string> {
++++  const role = hydrationRole(request.stepRole);
++++  const cap = role === "review" || role === "qa"
++++    ? Math.min(request.diffBytes ?? 0, 2000)
++++    : role === "wave-close-up" || role === "plan-close-up"
++++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
++++      : Math.min(request.inputBytes ?? 0, 500);
++++  if (cap <= 0) return "";
++++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
++++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
++++}
++++
+++ /**
+++- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
+++- * Detail is dropped; over-budget output condenses summaries, drops affects,
+++- * then sheds trailing entries until the UTF-8 byte ceiling is met.
++++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
++++ * condenses summaries, drops affects, then sheds trailing entries; empty output
++++ * is returned when no record fits the ceiling.
+++  */
+++ export function renderConcernsYaml(
+++-  concerns: StoredConcernArtifact[],
++++  records: Array<Record<string, unknown>>,
+++   maxBytes = 8000
+++ ): string {
+++-  const records = concerns.map(terseConcern);
++++  if (maxBytes <= 0 || records.length === 0) return "";
+++   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
+++     { records },
+++     { records: records.map(({ affects: _affects, ...rest }) => rest) },
+++@@ -110,7 +194,7 @@ export function renderConcernsYaml(
+++       if (utf8Bytes(text) <= maxBytes) return text;
+++     }
+++   }
+++-  return serialize([]);
++++  return "";
+++ }
+++ 
+++ /**
+++diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++index a1f0728..ff3f5e8 100644
+++--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++@@ -317,7 +317,7 @@ describe("Concern store", () => {
+++     });
+++   }
+++ 
+++-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
+++     const identity = {
+++       kind: "risk" as const,
+++       summary: "  Flaky   GATE ",
+++@@ -339,7 +339,9 @@ describe("Concern store", () => {
+++     expect(
+++       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+++     ).not.toBe(fp);
+++-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
++++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
++++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
+++   });
+++ 
+++   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+++diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+++new file mode 100644
+++index 0000000..d75dcb9
+++--- /dev/null
++++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+++@@ -0,0 +1,839 @@
++++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++++import fs from "node:fs";
++++import path from "node:path";
++++import os from "node:os";
++++import { createHash } from "node:crypto";
++++import yaml from "yaml";
++++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++++import { runIteration } from "../../src/core/flows/iteration.js";
++++import { Repo } from "../../src/core/git/repo.js";
++++import { loadPromptLibrary } from "../../src/core/prompts.js";
++++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++++import {
++++  aggregateConcerns,
++++  applyConcernTriage,
++++  concernFingerprint,
++++  countConcerns,
++++  listConcerns,
++++} from "../../src/core/concerns.js";
++++import * as triageModule from "../../src/core/triage.js";
++++import type {
++++  ConcernSource,
++++  PipelineConfig,
++++  ProjectConfig,
++++  StoredConcernArtifact,
++++} from "../../src/core/artifacts.js";
++++
++++/**
++++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
++++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
++++ *
++++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
++++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
++++ * plan-review/architect/develop-family from their registered prompt input.
++++ */
++++
++++const ORCH = ".factory";
++++const TASK = "hydration-caps";
++++const agentsDir = path.resolve(import.meta.dir, "../../agents");
++++
++++type Hydrate = (
++++  taskDir: string,
++++  request: {
++++    stepRole: string;
++++    inputBytes?: number;
++++    diffBytes?: number;
++++    taskDiffBytes?: number;
++++    consumer?: string;
++++  }
++++) => Promise<string>;
++++type ListHydrated = (
++++  taskDir: string,
++++  consumer: string
++++) => Promise<Array<Record<string, any>>>;
++++
++++/**
++++ * New triage exports are looked up dynamically so this file collects against the
++++ * pre-implementation module and fails on behavior, not on a missing import.
++++ */
++++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
++++  const mod = triageModule as unknown as {
++++    hydrateStepConcerns?: Hydrate;
++++    listHydratedConcerns?: ListHydrated;
++++  };
++++  const hydrate = mod.hydrateStepConcerns;
++++  const list = mod.listHydratedConcerns;
++++  if (!hydrate || !list) {
++++    return {
++++      hydrate: (() => {
++++        throw new Error("hydrateStepConcerns is not implemented");
++++      }) as unknown as Hydrate,
++++      list: (() => {
++++        throw new Error("listHydratedConcerns is not implemented");
++++      }) as unknown as ListHydrated,
++++    };
++++  }
++++  return { hydrate, list };
++++}
++++
++++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
++++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
++++
++++describe("Hydration caps (adr-hydration-single-cap)", () => {
++++  let tmpRepo: TmpRepo;
++++  let repo: Repo;
++++  let taskWt: string;
++++  let taskDir: string;
++++  let worktreeRoot: string;
++++  let pipeline: PipelineConfig;
++++  let project: ProjectConfig;
++++  let prompts: ReturnType<typeof loadPromptLibrary>;
++++
++++  beforeEach(() => {
++++    tmpRepo = createTmpRepo();
++++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++++    fs.mkdirSync(worktreeRoot, { recursive: true });
++++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++++    taskWt = tmpRepo.dir;
++++    taskDir = path.join(taskWt, ORCH, TASK);
++++    fs.mkdirSync(taskDir, { recursive: true });
++++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
++++    tmpRepo.commit("add hydration caps task");
++++
++++    pipeline = {
++++      models: {
++++        roles: {
++++          workhorse: { model: "model-workhorse" },
++++          "alt-workhorse": { model: "model-alt-workhorse" },
++++          architect: { model: "model-architect" },
++++          "alt-architect": { model: "model-alt-architect" },
++++          simpler: { model: "model-simpler" },
++++        },
++++      },
++++      agents: {
++++        developer: { role: "workhorse" },
++++        reviewer: { role: "alt-workhorse" },
++++        qa: { role: "alt-workhorse" },
++++        architect: { role: "architect" },
++++        "plan-reviewer": { role: "alt-architect" },
++++        pm: { role: "alt-workhorse" },
++++        "wave-close-up": { role: "alt-workhorse" },
++++        "plan-close-up": { role: "alt-workhorse" },
++++      },
++++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++++      limits: { maxPlanReviewRounds: 1 },
++++    };
++++    project = { orchestrationFolder: ORCH, worktreeRoot };
++++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
++++  });
++++
++++  afterEach(() => {
++++    tmpRepo.cleanup();
++++  });
++++
++++  function concern(
++++    overrides: Partial<StoredConcernArtifact> & { id: string }
++++  ): StoredConcernArtifact {
++++    return {
++++      kind: "risk",
++++      summary: `Concern ${overrides.id}`,
++++      detail: "detail",
++++      severity: "medium",
++++      status: "open",
++++      source: { record: "001-develop-a1", agent: "developer" },
++++      createdAt: "2026-01-01T00:00:00.000Z",
++++      updatedAt: "2026-01-01T00:00:00.000Z",
++++      ...overrides,
++++    };
++++  }
++++
++++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++++  }
++++
++++  function concernsDir() {
++++    return path.join(taskDir, "concerns");
++++  }
++++
++++  function concernFiles(prefix = "c-") {
++++    const dir = concernsDir();
++++    if (!fs.existsSync(dir)) return [];
++++    return fs
++++      .readdirSync(dir)
++++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++++      .map((name) => name.slice(0, -".yaml".length))
++++      .sort();
++++  }
++++
++++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
++++    const harness = new FakeHarness();
++++    const label = `${TASK}/runs/review#a1`;
++++    harness.scriptOutcome(label, {
++++      ok: true,
++++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++++    });
++++    harness.scriptOutcome(`${label}#relaunch`, {
++++      ok: true,
++++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++++    });
++++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
++++    return runAgentStep({
++++      task: TASK,
++++      stepId: "review",
++++      stepFragment: "steps/review",
++++      agent: "reviewer",
++++      cwd: taskWt,
++++      taskWt,
++++      taskDir,
++++      recordsDir: path.join(taskDir, "runs"),
++++      repo,
++++      harness,
++++      pipeline,
++++      project,
++++      prompts: promptsFor,
++++      promptVars,
++++    }).then((result) => ({ result, harness }));
++++  }
++++
++++  function promptOf(harness: FakeHarness): string {
++++    const call = harness.calls.find((c) => c.type === "run");
++++    if (!call || call.type !== "run") throw new Error("no agent run captured");
++++    return call.run.prompt;
++++  }
++++
++++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
++++    await writeConcern({
++++      id: "c-aaaaaaaaaa",
++++      kind: "risk",
++++      summary: "Retry loop can spin",
++++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
++++      severity: "high",
++++      affects: ["item-a"],
++++    });
++++    await writeConcern({
++++      id: "c-bbbbbbbbbb",
++++      kind: "blocker",
++++      summary: "Missing adapter",
++++      detail: "e".repeat(600),
++++      severity: "medium",
++++    });
++++
++++    const { hydrate } = hydrationApi();
++++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++++    expect(hydrated).toContain("c-aaaaaaaaaa");
++++    expect(hydrated).toContain("Retry loop can spin");
++++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
++++    expect(yaml.parse(hydrated)).toHaveLength(2);
++++
++++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
++++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
++++    expect(small).toContain("c-");
++++  });
++++
++++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
++++    await writeConcern({
++++      id: "c-cccccccccc",
++++      kind: "tech-debt",
++++      summary: "Plan duplicates the retry helper",
++++      detail: "f".repeat(600),
++++      severity: "medium",
++++      affects: ["m1"],
++++    });
++++    await writeConcern({
++++      id: "c-dddddddddd",
++++      kind: "risk",
++++      summary: "Milestone boundary depends on an unbuilt adapter",
++++      detail: "g".repeat(600),
++++      severity: "high",
++++      affects: ["m1"],
++++    });
++++
++++    const { hydrate } = hydrationApi();
++++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
++++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
++++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
++++    expect(hydrated).toContain("c-cccccccccc");
++++
++++    // Iteration 2+ has merged code on the branch: classification still uses the
++++    // registered prompt input, not a branch-state diff inference.
++++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
++++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
++++  });
++++
++++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
++++    await writeConcern({
++++      id: "c-eeeeeeeeee",
++++      kind: "tech-debt",
++++      summary: "Shared helper duplicated in two modules",
++++      detail: "h".repeat(3000),
++++      severity: "medium",
++++    });
++++    await writeConcern({
++++      id: "c-ffffffffff",
++++      kind: "assumption",
++++      summary: "Cache survives restart",
++++      detail: "i".repeat(3000),
++++      severity: "low",
++++    });
++++
++++    const { hydrate } = hydrationApi();
++++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
++++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++++    expect(hydrated).toContain("c-eeeeeeeeee");
++++
++++    const planCloseup = await hydrate(taskDir, {
++++      stepRole: "plan-close-up",
++++      taskDiffBytes: 5000,
++++    });
++++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
++++  });
++++
++++  it("returns empty hydration for zero and tiny caps", async () => {
++++    await writeConcern({
++++      id: "c-1111111111",
++++      kind: "risk",
++++      summary: "Visible only when the cap allows bytes",
++++      detail: "j".repeat(600),
++++    });
++++
++++    const { hydrate } = hydrationApi();
++++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++++    expect(positive).not.toBe("");
++++    expect(idLines(positive).length).toBeGreaterThan(0);
++++
++++    for (const cap of [0, 1, 3]) {
++++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
++++      expect(empty).toBe("");
++++      expect(idLines(empty)).toEqual([]);
++++    }
++++  });
++++
++++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
++++    const summary = "Retry loop can spin";
++++    const cid = "c-2222222222";
++++    await writeConcern({
++++      id: cid,
++++      kind: "risk",
++++      summary,
++++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
++++      severity: "high",
++++      affects: ["item-a"],
++++    });
++++
++++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
++++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
++++    expect(promptOf(zero.harness)).not.toContain(cid);
++++
++++    const hydrated = await runReview({
++++      assignment: "Review",
++++      checks: "",
++++      diff: "d".repeat(3000),
++++      dispositionsCriteria: "",
++++    });
++++    const prompt = promptOf(hydrated.harness);
++++    expect(prompt).toContain(cid);
++++    expect(prompt).toContain(summary);
++++    expect(prompt).not.toContain("DETAIL_SENTINEL");
++++
++++    const supplied = await runReview({
++++      assignment: "Review",
++++      checks: "",
++++      diff: "d".repeat(3000),
++++      dispositionsCriteria: "",
++++      concernsYaml: "CALLER-CONCERNS: c-caller",
++++    });
++++    const suppliedPrompt = promptOf(supplied.harness);
++++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
++++    expect(suppliedPrompt).not.toContain(cid);
++++  });
++++
++++  it("computes close-up task diff bytes through the injected git function", async () => {
++++    const cid = "c-3333333333";
++++    await writeConcern({
++++      id: cid,
++++      kind: "risk",
++++      summary: "Close-up concern",
++++      detail: "l".repeat(400),
++++      severity: "medium",
++++    });
++++
++++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
++++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++++    fs.writeFileSync(
++++      path.join(overridesDir, "steps", "wave-close-up.md"),
++++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
++++      "utf8"
++++    );
++++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
++++
++++    const gitCalls: string[][] = [];
++++    const gitFn = async (_cwd: string, args: string[]) => {
++++      gitCalls.push(args);
++++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
++++    };
++++    const harness = new FakeHarness();
++++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
++++      ok: true,
++++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++++    });
++++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
++++      ok: true,
++++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++++    });
++++    try {
++++      await runAgentStep({
++++        task: TASK,
++++        stepId: "wave-close-up-1-1",
++++        stepFragment: "steps/wave-close-up",
++++        agent: "wave-close-up",
++++        cwd: taskWt,
++++        taskWt,
++++        taskDir,
++++        parentBranch: "topic/demo",
++++        recordsDir: path.join(taskDir, "runs"),
++++        repo,
++++        harness,
++++        pipeline,
++++        project,
++++        prompts: closeupPrompts,
++++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
++++        gitFn,
++++      } as any);
++++    } finally {
++++      fs.rmSync(overridesDir, { recursive: true, force: true });
++++    }
++++
++++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
++++    const prompt = promptOf(harness);
++++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
++++    expect(block).toContain(cid);
++++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
++++    expect(utf8Bytes(block)).toBeLessThan(5000);
++++  });
++++
++++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
++++    const cid = "c-4444444444";
++++    await writeConcern({
++++      id: cid,
++++      kind: "blocker",
++++      summary: "Database schema migration is pending",
++++      detail: "m".repeat(400),
++++      severity: "high",
++++      status: "routed",
++++      disposition: "architect",
++++      affects: ["seed"],
++++    });
++++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
++++      id: "dec-1",
++++      context: "task",
++++      decision: "continue",
++++      rationale: "漢".repeat(120),
++++      timestamp: "2026-01-01T00:00:00.000Z",
++++    });
++++
++++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
++++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++++    fs.writeFileSync(
++++      path.join(overridesDir, "steps", "architect-plan.md"),
++++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
++++      "utf8"
++++    );
++++    const architectPrompts = loadPromptLibrary({
++++      builtinDir: agentsDir,
++++      overrideDirs: [overridesDir],
++++    });
++++
++++    const harness = new FakeHarness();
++++    let architectPrompt = "";
++++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
++++      architectPrompt = run.prompt;
++++      return {
++++        ok: true,
++++        data: {
++++          iteration: 1,
++++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
++++          itemOutlines: [],
++++        },
++++      };
++++    });
++++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++++      ok: true,
++++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++++    });
++++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++++      ok: true,
++++      data: { iteration: 1, items: [] },
++++    });
++++
++++    try {
++++      await runIteration({
++++        task: TASK,
++++        taskDir,
++++        taskWt,
++++        repo,
++++        harness,
++++        pipeline: {
++++          ...pipeline,
++++          limits: {
++++            hydrationBytes: 20,
++++            maxPlanReviewRounds: 1,
++++            maxIterations: 3,
++++            maxParallelItems: 2,
++++            maxParallelTurns: 4,
++++            maxStepAttempts: 3,
++++            maxFixRounds: 3,
++++          },
++++        },
++++        project,
++++        prompts: architectPrompts,
++++      });
++++    } finally {
++++      fs.rmSync(overridesDir, { recursive: true, force: true });
++++    }
++++
++++    expect(architectPrompt).toContain(cid);
++++    expect(occurrences(architectPrompt, cid)).toBe(1);
++++    expect(architectPrompt).not.toContain("--- Concerns ---");
++++
++++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
++++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
++++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
++++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
++++    expect(debt).not.toContain("\uFFFD");
++++    expect(steering).not.toContain("\uFFFD");
++++
++++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
++++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
++++    expect(concerns).toContain(cid);
++++  });
++++});
++++
++++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
++++  let tmpRepo: TmpRepo;
++++  let taskDir: string;
++++
++++  beforeEach(() => {
++++    tmpRepo = createTmpRepo();
++++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
++++    fs.mkdirSync(taskDir, { recursive: true });
++++  });
++++
++++  afterEach(() => {
++++    tmpRepo.cleanup();
++++  });
++++
++++  function concern(
++++    overrides: Partial<StoredConcernArtifact> & { id: string }
++++  ): StoredConcernArtifact {
++++    return {
++++      kind: "risk",
++++      summary: `Concern ${overrides.id}`,
++++      detail: "detail",
++++      severity: "medium",
++++      status: "open",
++++      source: { record: "001-develop-a1", agent: "developer" },
++++      createdAt: "2026-01-01T00:00:00.000Z",
++++      updatedAt: "2026-01-01T00:00:00.000Z",
++++      ...overrides,
++++    };
++++  }
++++
++++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++++  }
++++
++++  async function writeRemarkable(
++++    id: string,
++++    chosen: string,
++++    overrides: Record<string, unknown> = {}
++++  ) {
++++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
++++      id,
++++      chosen,
++++      alternatives: ["Other"],
++++      why: "w".repeat(300),
++++      status: "open",
++++      source: { record: "001-architect-plan-a1", agent: "architect" },
++++      createdAt: "2026-01-01T00:00:00.000Z",
++++      updatedAt: "2026-01-01T00:00:00.000Z",
++++      ...overrides,
++++    });
++++  }
++++
++++  it("hydrates open concerns with pending resolutions for review", async () => {
++++    const pending = {
++++      action: "carry" as const,
++++      note: "Needs an architect decision",
++++      by: "wave-close-up",
++++      at: "2026-01-02T00:00:00.000Z",
++++    };
++++    await writeConcern({
++++      id: "c-5555555555",
++++      summary: "Needs a decision",
++++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
++++      pendingResolution: pending,
++++    });
++++
++++    const { list } = hydrationApi();
++++    for (const consumer of ["review", "develop", "qa"]) {
++++      const hydrated = await list(taskDir, consumer);
++++      expect(hydrated).toHaveLength(1);
++++      expect(hydrated[0]).toMatchObject({
++++        id: "c-5555555555",
++++        kind: "risk",
++++        summary: "Needs a decision",
++++        pendingResolution: pending,
++++      });
++++      expect(hydrated[0]).not.toHaveProperty("detail");
++++    }
++++  });
++++
++++  it("includes routed concerns for close-ups but not for review", async () => {
++++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
++++    await writeConcern({
++++      id: "c-7777777777",
++++      status: "routed",
++++      disposition: "architect",
++++      createdAt: "2026-01-02T00:00:00.000Z",
++++    });
++++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
++++
++++    const { list } = hydrationApi();
++++    const review = await list(taskDir, "review");
++++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
++++
++++    const closeup = await list(taskDir, "closeup");
++++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
++++  });
++++
++++  it("hydrates open remarkables as terse remarkable records", async () => {
++++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
++++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
++++
++++    const { list } = hydrationApi();
++++    const review = await list(taskDir, "review");
++++    expect(review).toEqual([
++++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++++    ]);
++++
++++    const architect = await list(taskDir, "architect");
++++    expect(architect).toEqual([
++++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++++    ]);
++++  });
++++
++++  it("includes dismissed escalated concerns only in the architect set", async () => {
++++    await writeConcern({
++++      id: "c-9999999999",
++++      status: "dismissed",
++++      dismissReason: "not real",
++++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
++++      createdAt: "2026-01-01T00:00:00.000Z",
++++    });
++++    await writeConcern({
++++      id: "c-ababababab",
++++      status: "dismissed",
++++      dismissReason: "quiet",
++++      createdAt: "2026-01-02T00:00:00.000Z",
++++    });
++++    await writeConcern({
++++      id: "c-acacacacac",
++++      status: "open",
++++      createdAt: "2026-01-03T00:00:00.000Z",
++++    });
++++
++++    const { list } = hydrationApi();
++++    const review = await list(taskDir, "review");
++++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
++++
++++    const architect = await list(taskDir, "architect");
++++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
++++    expect(architect[0]).toMatchObject({
++++      id: "c-9999999999",
++++      status: "dismissed",
++++      escalated: true,
++++    });
++++  });
++++
++++  it("counts concerns only, never remarkables", async () => {
++++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
++++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
++++
++++    await writeConcern({ id: "c-adadadadad", status: "open" });
++++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
++++  });
++++});
++++
++++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
++++  let tmpRepo: TmpRepo;
++++  let repo: Repo;
++++  let taskWt: string;
++++  let taskDir: string;
++++
++++  beforeEach(() => {
++++    tmpRepo = createTmpRepo();
++++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
++++    taskWt = tmpRepo.dir;
++++    taskDir = path.join(taskWt, ORCH, TASK);
++++    fs.mkdirSync(taskDir, { recursive: true });
++++  });
++++
++++  afterEach(() => {
++++    tmpRepo.cleanup();
++++  });
++++
++++  function source(record = "001-develop-a1"): ConcernSource {
++++    return { record, agent: "developer" };
++++  }
++++
++++  function concernFiles() {
++++    const dir = path.join(taskDir, "concerns");
++++    if (!fs.existsSync(dir)) return [];
++++    return fs
++++      .readdirSync(dir)
++++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
++++      .map((name) => name.slice(0, -".yaml".length))
++++      .sort();
++++  }
++++
++++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
++++  function legacyFingerprint(input: {
++++    kind: string;
++++    summary: string;
++++    location?: { file: string; line?: number };
++++    affects?: string[];
++++  }): string {
++++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
++++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
++++    const parts = [
++++      input.kind,
++++      norm(input.summary),
++++      input.location?.file.trim() ?? null,
++++      input.location?.line ?? null,
++++      affects,
++++    ];
++++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++++  }
++++
++++  it("fingerprints kind, normalized summary, and location without affects", () => {
++++    const identity = {
++++      kind: "risk" as const,
++++      summary: "  Flaky   GATE ",
++++      location: { file: "src/core/example.ts", line: 7 },
++++    };
++++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
++++
++++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
++++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
++++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
++++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
++++
++++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
++++    expect(
++++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++++    ).not.toBe(id);
++++  });
++++
++++  it("unions affects without forking and preserves terminal status", async () => {
++++    const identity = {
++++      kind: "risk" as const,
++++      summary: "Flaky gate blocks merges",
++++      location: { file: "src/core/merge.ts", line: 12 },
++++    };
++++    const id = concernFingerprint(identity);
++++
++++    await aggregateConcerns(
++++      { taskDir, taskWt, repo, source: source() },
++++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
++++    );
++++    expect(concernFiles()).toEqual([id]);
++++
++++    await aggregateConcerns(
++++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
++++    );
++++    expect(concernFiles()).toEqual([id]);
++++    let stored = await readYaml<StoredConcernArtifact>(
++++      path.join(taskDir, "concerns", `${id}.yaml`)
++++    );
++++    expect(stored.affects).toEqual(["item-a", "item-b"]);
++++    expect(stored.status).toBe("open");
++++    expect(stored.detail).toBe("a much longer detail");
++++    expect(stored.severity).toBe("high");
++++    expect(stored.source.escalated).toBe(true);
++++
++++    await applyConcernTriage({
++++      taskDir,
++++      taskWt,
++++      repo,
++++      isTriager: true,
++++      suggestions: [
++++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
++++      ],
++++    });
++++
++++    await aggregateConcerns(
++++      { taskDir, taskWt, repo, source: source("003-review-a1") },
++++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
++++    );
++++    expect(concernFiles()).toEqual([id]);
++++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
++++    expect(stored.status).toBe("dismissed");
++++    expect(stored.dismissReason).toBe("covered by ADR-1");
++++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
++++    expect(stored.source.escalated).toBe(true);
++++  });
++++
++++  it("renames a legacy affects-keyed file to the stable id", async () => {
++++    const identity = {
++++      kind: "risk" as const,
++++      summary: "Legacy concern",
++++      location: { file: "src/legacy.ts", line: 4 },
++++    };
++++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
++++    const stableId = concernFingerprint(identity);
++++    expect(legacyId).not.toBe(stableId);
++++
++++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
++++      id: legacyId,
++++      ...identity,
++++      detail: "legacy detail",
++++      severity: "medium",
++++      status: "open",
++++      affects: ["old"],
++++      source: { record: "000-develop-a1", agent: "developer" },
++++      createdAt: "2026-01-01T00:00:00.000Z",
++++      updatedAt: "2026-01-01T00:00:00.000Z",
++++    });
++++    expect(concernFiles()).toEqual([legacyId]);
++++
++++    await aggregateConcerns(
++++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
++++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
++++    );
++++
++++    expect(concernFiles()).toEqual([stableId]);
++++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
++++    const stored = await readYaml<StoredConcernArtifact>(
++++      path.join(taskDir, "concerns", `${stableId}.yaml`)
++++    );
++++    expect(stored.id).toBe(stableId);
++++    expect(stored.affects).toEqual(["new", "old"]);
++++    expect(stored.detail).toBe("new detail");
++++    expect(stored.severity).toBe("high");
++++
++++    // Re-emitting with another affect keeps the same stable triage id.
++++    await aggregateConcerns(
++++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++++      [{ ...identity, affects: ["new", "third"] }]
++++    );
++++    expect(concernFiles()).toEqual([stableId]);
++++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
++++  });
++++});
+++diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++index fb7cc9b..df5eac8 100644
+++--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
++++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++@@ -16,9 +16,9 @@ import {
+++   concernMailboxId,
+++   isDebtConcern,
+++   partitionReviewSuggestions,
+++-  renderConcernsYaml,
+++   type ReviewTriageOutcome,
+++ } from "../../src/core/triage.js";
++++import * as triageModule from "../../src/core/triage.js";
+++ import type {
+++   PipelineConfig,
+++   ProjectConfig,
+++@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+++         assignment: "Review the item",
+++         checks: "",
+++         testDiff: "",
+++-        diff: "",
++++        diff: "d".repeat(3000),
+++         dispositionsCriteria: "",
+++       },
+++     });
+++@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+++     expect(qa.fixRequired).toBe(false);
+++   });
+++ 
+++-  it("renders condensing concern YAML without detail and within the byte cap", () => {
++++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
+++     const concerns = [
+++       storedConcern({
+++         id: "c-aaaaaaaaaa",
+++@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
+++         detail: "e".repeat(600),
+++       }),
+++     ];
+++-
+++-    const rendered = renderConcernsYaml(concerns);
++++    for (const concern of concerns) await writeConcern(concern);
++++
++++    const hydrate = (
++++      triageModule as unknown as {
++++        hydrateStepConcerns?: (
++++          taskDir: string,
++++          request: { stepRole: string; diffBytes: number }
++++        ) => Promise<string>;
++++      }
++++    ).hydrateStepConcerns;
++++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
++++
++++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
+++     const parsed = yaml.parse(rendered);
+++     expect(Array.isArray(parsed)).toBe(true);
+++     expect(parsed).toHaveLength(2);
+++@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+++       Buffer.byteLength(JSON.stringify(concerns), "utf8")
+++     );
+++ 
+++-    const capped = renderConcernsYaml(concerns, 120);
++++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
+++     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
+++     expect(capped).not.toContain("\uFFFD");
+++   });
+++diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++index 3eb7799..58961a9 100644
+++--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
+++     prompts = loadPromptLibrary({
+++       builtinDir: path.resolve(import.meta.dir, "../../agents"),
+++       overrideDirs: [],
++++      // The single hydration source is concernsYaml; prompt fragments gain the
++++      // placeholder in the prompt-fragments item, so this test supplies it here.
++++      overrides: {
++++        "steps/architect-plan":
++++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
++++        "steps/architect-wave-report":
++++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
++++      },
+++     });
+++   });
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["approved","changes_requested"])
+++- summary (string, required)
+++- suggestions (array of object, required)
+++  - id (string, required)
+++  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
+++  - summary (string, required)
+++  - detail (string, optional)
+++  - location (object, optional)
+++    - file (string, required)
+++    - line (integer, optional)
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..7956d3a
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/meta.yaml
++@@ -0,0 +1,19 @@
+++seq: 3
+++name: qa
+++attempt: 1
+++fixRound: 1
+++agent: qa
+++role: alt-workhorse
+++models:
+++  - opencode-go/muse-spark-1.3-contributor
+++  - opencode-go/deepseek-v4.1-flash
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-08T19:50:25.163Z
+++session: 01a1bcb6-5653-7033-b9b4-41d98dfceafa
+++endedAt: 2026-11-08T20:56:01.718Z
+++usage:
+++  inputTokens: 190650
+++  outputTokens: 100837
+++  costUsd: 0.050218
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T19-50-28-691Z_01a1bcb6-5653-7033-b9b4-41d98dfceafa
++diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
++new file mode 100644
++index 0000000..8f93e33
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/003-qa-r1-a1/output.yaml
++@@ -0,0 +1,38 @@
+++status: approved
+++summary: Verified caps, sets, fingerprint-union, legacy rename; gates green; no
+++  test weakening
+++suggestions:
+++  - id: develop-family-dormant-injection
+++    disposition: optional
+++    summary: "Develop-family hydration dormant: KNOWN_VARS lacks concernsYaml so
+++      step-runner never injects"
+++    detail: hydrateStepConcerns maps develop/test-first/fix-round/etc to 500B
+++      inputBytes branch, but step-runner gates on
+++      knownVars.includes(concernsYaml) and KNOWN_VARS for develop-family has no
+++      concernsYaml entry. Path is correct per current fragments (no placeholder
+++      to fill) but unexercised end-to-end; coordinate with prompt-fragments item
+++      to register placeholder plus KNOWN_VARS, or document as intentional.
+++    location:
+++      file: plugins/software-factory/src/core/flows/step-runner.ts
+++      line: 306
+++  - id: legacy-multi-fork-merge
+++    disposition: optional
+++    summary: Legacy migration merges first match only; additional pre-union forks
+++      would persist
+++    detail: legacyConcern returns first same kind+normSummary+location file; once
+++      stable file exists the scan is skipped, so hypothetical multiple
+++      affects-keyed forks for one identity leave duplicates. Spec says singular
+++      rename-merge with no GC, so compliant; consider merging all matches or
+++      documenting single-merge sufficiency.
+++    location:
+++      file: plugins/software-factory/src/core/concerns.ts
+++      line: 76
+++  - id: test-dynamic-lookup-cleanup
+++    disposition: optional
+++    summary: Replace dynamic triage lookup with direct imports now implementation is
+++      green
+++    detail: New and updated tests access hydrateStepConcerns via dynamic namespace
+++      cast to allow red-phase collection; now green, direct named imports would
+++      simplify and catch signature drift at compile time. No behavior impact.
+++    location:
+++      file: plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
++index 5e2078d..197bc81 100644
++--- a/plugins/software-factory/src/core/concerns.ts
+++++ b/plugins/software-factory/src/core/concerns.ts
++@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
++ const hash = (prefix: string, parts: unknown[]) =>
++   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
++-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
++ 
++-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+++/** Stable concern identity: kind, normalized summary, location. */
++ export function concernFingerprint(c: ConcernInput): string {
++-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
++ }
++ 
++ async function readExisting<T>(file: string): Promise<T | undefined> {
++@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
++   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
++   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
++   const location = input.location ?? existing?.location;
++-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+++  const affects = input.affects
+++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
+++    : existing?.affects;
++   return {
++     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
++     summary: existing?.summary ?? input.summary.trim(), detail,
++@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
++   };
++ }
++ 
+++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
+++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT") return undefined;
+++    throw err;
+++  }
+++  const [file, line] = locationOf(input.location);
+++  for (const name of names.sort()) {
+++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
+++    const candidate = path.join(dir, name);
+++    try {
+++      const record = await readYaml<StoredConcernArtifact>(candidate);
+++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
+++      const [rfile, rline] = locationOf(record.location);
+++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
+++      return { file: candidate, record };
+++    } catch { /* Corrupt entries are not migration candidates. */ }
+++  }
+++  return undefined;
+++}
+++
++ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
++ export async function aggregateConcerns(
++   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
++@@ -85,10 +110,17 @@ export async function aggregateConcerns(
++     const out: StoredConcernArtifact[] = [];
++     for (const input of concerns) {
++       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
++-      const existing = await readExisting<StoredConcernArtifact>(file);
+++      let existing = await readExisting<StoredConcernArtifact>(file);
+++      let legacyFile: string | undefined;
+++      if (!existing) {
+++        const migrated = await legacyConcern(dir, input);
+++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
+++      }
++       const merged = mergeConcern(existing, input, ctx.source, at);
++-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
+++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++       await writeYamlAtomic(file, merged);
+++      if (legacyFile) await fs.promises.unlink(legacyFile);
++       dirty = true; out.push(merged);
++     }
++     for (const decision of remarkables) {
++@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
++   }
++ }
++ 
++-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
++-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
++-  const dir = dirOf(taskDir);
++-  let names: string[];
++-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++-    if (err?.code === "ENOENT") return "[]";
++-    throw err;
++-  }
++-  const items = await Promise.all(
++-    names
++-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
++-      .map(async (name) => {
++-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++-      })
++-  );
++-  const open = items
++-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
++-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
++-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
++-}
++-
++ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
++   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
++   const updated = await locks.runExclusive(ctx.taskDir, async () => {
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index 84a77f6..0cc7f10 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
++ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
++ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++-  hydrateConcernsYaml,
++   listConcernIds,
++   listConcerns,
++   partitionSuggestions,
++ } from "../concerns.js";
++-import { renderConcernsYaml } from "../triage.js";
++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
++ import { validateEdits } from "../plan/limits.js";
++ import { applyEdits } from "../plan/apply.js";
++@@ -169,23 +167,13 @@ async function buildArchitectHydration(
++     }
++   }
++ 
++-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
++-  // every architect turn the terse decision context the act phase acts on.
++-  // Appended last so the byte cap never evicts it.
++-  const actionableConcerns = (await listConcerns(taskDir)).filter(
++-    (c) => c.status === "open" || c.status === "routed"
++-  );
++-  if (actionableConcerns.length > 0) {
++-    parts.push(
++-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
++-    );
++-  }
++-
+++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
++   const combined = parts.join("\n\n");
++-  if (combined.length <= maxBytes) {
++-    return combined;
++-  }
++-  return combined.slice(combined.length - maxBytes);
+++  const buf = Buffer.from(combined, "utf8");
+++  if (buf.length <= maxBytes) return combined;
+++  let start = buf.length - maxBytes;
+++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
+++  return buf.subarray(start).toString("utf8");
++ }
++ 
++ /**
++@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++     // Triage ids are those that existed before this review round; capturing
++     // them here mirrors the step-runner exact-id partition.
++     const knownConcernIds = await listConcernIds(taskDir);
++-    const concernsYaml = await hydrateConcernsYaml(taskDir);
++     // Check if review round record already exists
++     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
++     const revStepRes = await runAgentStep({
++@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         plan: JSON.stringify(plan, null, 2),
++         intent: intentText,
++         context: contextYaml,
++-        concernsYaml,
++         limits: JSON.stringify(limits, null, 2),
++         dispositionsCriteria: formatDispositionsSection(
++           loadCriteriaBundle(pipeline.criteria).dispositions,
++@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         waveReport: waveSummary,
++         infra: infraYaml,
++       },
+++      parentBranch,
++       turnsSemaphore,
++       budgetTracker,
++       iteration,
++@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++       plan: JSON.stringify(plan, null, 2),
++       context: contextYaml,
++     },
+++    parentBranch,
++     turnsSemaphore,
++     budgetTracker,
++     iteration,
++diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
++index 3b158c4..69fba68 100644
++--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++++ b/plugins/software-factory/src/core/flows/step-runner.ts
++@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++   aggregateConcerns,
++   applyCloseupResolutions,
++-  listOpenConcerns,
++ } from "../concerns.js";
++ import {
++   applyReviewTriage,
++-  renderConcernsYaml,
+++  hydrateStepConcerns,
++   TriageValidationError,
++   type ReviewTriageOutcome,
++ } from "../triage.js";
+++import { KNOWN_VARS } from "../prompt-vars.js";
++ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
++ import { captureHead, enforceHead } from "../git/guard.js";
++ import { commitAll } from "../git/commit.js";
++@@ -70,6 +70,8 @@ export interface StepRunOptions {
++   project: ProjectConfig;
++   prompts: any;
++   promptVars: Record<string, string>;
+++  parentBranch?: string;
+++  gitFn?: typeof git;
++   turnsSemaphore?: Semaphore;
++   customSchema?: JSONSchema;
++   log?: (msg: string) => void;
++@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
++   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
++   const fragment = stepFragment ?? `steps/${stepId}`;
++   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
++-  const openConcerns = await listOpenConcerns(taskDir);
++-  const concernsYaml = openConcerns.length > 0
++-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
++-    : "";
++   const effectivePromptVars: Record<string, string> = {
++     humanInvolvementCriteria: formatHumanInvolvementCriteria(
++       criteriaBundle.humanInvolvement,
++       pipeline.humanInvolvement
++     ),
++-    concernsYaml,
++     ...promptVars,
++   };
+++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
+++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
+++    const stepRole = fragment.replace(/^steps\//, "");
+++    if (stepRole === "review" || stepRole === "qa") {
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
+++      });
+++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
+++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+++        stepRole,
+++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
+++      });
+++    } else {
+++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
+++      const inputBytes = knownVars
+++        .filter((key) => !excluded.has(key))
+++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
+++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
+++    }
+++  }
++   let promptText: string;
++   let agentDef: { body: string; tools: string[]; description: string };
++   try {
++diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
++index 923a9d1..479287e 100644
++--- a/plugins/software-factory/src/core/triage.ts
+++++ b/plugins/software-factory/src/core/triage.ts
++@@ -1,7 +1,10 @@
+++import fs from "node:fs";
+++import path from "node:path";
++ import yaml from "yaml";
++ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
++-import { applyConcernTriage } from "./concerns.js";
+++import { applyConcernTriage, listConcerns } from "./concerns.js";
++ import type { Repo } from "./git/repo.js";
+++import { readYaml } from "./records/io.js";
++ import { writeQuestion } from "./steer.js";
++ 
++ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
++@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
++     severity: c.severity,
++     summary: c.summary,
++     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
+++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
+++    ...(c.status !== "open" ? { status: c.status } : {}),
+++    ...(c.disposition ? { disposition: c.disposition } : {}),
+++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
+++    ...(c.source?.escalated ? { escalated: true } : {}),
++   };
++ }
++ 
+++export interface HydrateStepConcernsRequest {
+++  stepRole: string;
+++  inputBytes?: number;
+++  diffBytes?: number;
+++  taskDiffBytes?: number;
+++  consumer?: string;
+++}
+++
++ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++ const serialize = (records: Array<Record<string, unknown>>) =>
++   yaml.stringify(records, { lineWidth: 0 });
++ const truncateChars = (text: string, max: number) =>
++   Array.from(text).slice(0, max).join("");
++ 
+++/** Normalizes step ids/fragments to their hydration role family. */
+++function hydrationRole(stepRole: string): string {
+++  const role = stepRole.replace(/^steps\//, "");
+++  if (role === "architect" || role.startsWith("architect-")) return "architect";
+++  if (role.startsWith("plan-review")) return "plan-review";
+++  if (role.startsWith("plan-close-up")) return "plan-close-up";
+++  if (role.startsWith("wave-close-up")) return "wave-close-up";
+++  if (role === "review" || role === "qa") return role;
+++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
+++  return role;
+++}
+++
+++function hydrationConsumer(role: string, consumer?: string): string {
+++  if (consumer) return consumer;
+++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
+++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
+++  return role === "architect" ? "architect" : role;
+++}
+++
+++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
+++  const dir = path.join(taskDir, "concerns");
+++  let names: string[];
+++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
+++    throw err;
+++  }
+++  const records = await Promise.all(
+++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
+++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+++    })
+++  );
+++  return records
+++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
+++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
+++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
+++}
+++
+++/** Hydrated concern set per consumer (adr-hydrated-sets). */
+++export async function listHydratedConcerns(
+++  taskDir: string,
+++  consumer: string
+++): Promise<Array<Record<string, unknown>>> {
+++  const includeRouted = consumer === "closeup" || consumer === "architect";
+++  const includeEscalated = consumer === "architect";
+++  const concerns = (await listConcerns(taskDir)).filter((c) =>
+++    c.status === "open" ||
+++    (includeRouted && c.status === "routed") ||
+++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
+++  );
+++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
+++}
+++
+++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
+++export async function hydrateStepConcerns(
+++  taskDir: string,
+++  request: HydrateStepConcernsRequest
+++): Promise<string> {
+++  const role = hydrationRole(request.stepRole);
+++  const cap = role === "review" || role === "qa"
+++    ? Math.min(request.diffBytes ?? 0, 2000)
+++    : role === "wave-close-up" || role === "plan-close-up"
+++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
+++      : Math.min(request.inputBytes ?? 0, 500);
+++  if (cap <= 0) return "";
+++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
+++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
+++}
+++
++ /**
++- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
++- * Detail is dropped; over-budget output condenses summaries, drops affects,
++- * then sheds trailing entries until the UTF-8 byte ceiling is met.
+++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
+++ * condenses summaries, drops affects, then sheds trailing entries; empty output
+++ * is returned when no record fits the ceiling.
++  */
++ export function renderConcernsYaml(
++-  concerns: StoredConcernArtifact[],
+++  records: Array<Record<string, unknown>>,
++   maxBytes = 8000
++ ): string {
++-  const records = concerns.map(terseConcern);
+++  if (maxBytes <= 0 || records.length === 0) return "";
++   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
++     { records },
++     { records: records.map(({ affects: _affects, ...rest }) => rest) },
++@@ -110,7 +194,7 @@ export function renderConcernsYaml(
++       if (utf8Bytes(text) <= maxBytes) return text;
++     }
++   }
++-  return serialize([]);
+++  return "";
++ }
++ 
++ /**
++diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++index a1f0728..ff3f5e8 100644
++--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
++@@ -317,7 +317,7 @@ describe("Concern store", () => {
++     });
++   }
++ 
++-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
++     const identity = {
++       kind: "risk" as const,
++       summary: "  Flaky   GATE ",
++@@ -339,7 +339,9 @@ describe("Concern store", () => {
++     expect(
++       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++     ).not.toBe(fp);
++-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
++   });
++ 
++   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
++diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++new file mode 100644
++index 0000000..d75dcb9
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
++@@ -0,0 +1,839 @@
+++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+++import fs from "node:fs";
+++import path from "node:path";
+++import os from "node:os";
+++import { createHash } from "node:crypto";
+++import yaml from "yaml";
+++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+++import { runAgentStep } from "../../src/core/flows/step-runner.js";
+++import { runIteration } from "../../src/core/flows/iteration.js";
+++import { Repo } from "../../src/core/git/repo.js";
+++import { loadPromptLibrary } from "../../src/core/prompts.js";
+++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+++import {
+++  aggregateConcerns,
+++  applyConcernTriage,
+++  concernFingerprint,
+++  countConcerns,
+++  listConcerns,
+++} from "../../src/core/concerns.js";
+++import * as triageModule from "../../src/core/triage.js";
+++import type {
+++  ConcernSource,
+++  PipelineConfig,
+++  ProjectConfig,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
+++
+++/**
+++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
+++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
+++ *
+++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
+++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
+++ * plan-review/architect/develop-family from their registered prompt input.
+++ */
+++
+++const ORCH = ".factory";
+++const TASK = "hydration-caps";
+++const agentsDir = path.resolve(import.meta.dir, "../../agents");
+++
+++type Hydrate = (
+++  taskDir: string,
+++  request: {
+++    stepRole: string;
+++    inputBytes?: number;
+++    diffBytes?: number;
+++    taskDiffBytes?: number;
+++    consumer?: string;
+++  }
+++) => Promise<string>;
+++type ListHydrated = (
+++  taskDir: string,
+++  consumer: string
+++) => Promise<Array<Record<string, any>>>;
+++
+++/**
+++ * New triage exports are looked up dynamically so this file collects against the
+++ * pre-implementation module and fails on behavior, not on a missing import.
+++ */
+++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
+++  const mod = triageModule as unknown as {
+++    hydrateStepConcerns?: Hydrate;
+++    listHydratedConcerns?: ListHydrated;
+++  };
+++  const hydrate = mod.hydrateStepConcerns;
+++  const list = mod.listHydratedConcerns;
+++  if (!hydrate || !list) {
+++    return {
+++      hydrate: (() => {
+++        throw new Error("hydrateStepConcerns is not implemented");
+++      }) as unknown as Hydrate,
+++      list: (() => {
+++        throw new Error("listHydratedConcerns is not implemented");
+++      }) as unknown as ListHydrated,
+++    };
+++  }
+++  return { hydrate, list };
+++}
+++
+++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
+++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
+++
+++describe("Hydration caps (adr-hydration-single-cap)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
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
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
+++    tmpRepo.commit("add hydration caps task");
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
+++        developer: { role: "workhorse" },
+++        reviewer: { role: "alt-workhorse" },
+++        qa: { role: "alt-workhorse" },
+++        architect: { role: "architect" },
+++        "plan-reviewer": { role: "alt-architect" },
+++        pm: { role: "alt-workhorse" },
+++        "wave-close-up": { role: "alt-workhorse" },
+++        "plan-close-up": { role: "alt-workhorse" },
+++      },
+++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+++      limits: { maxPlanReviewRounds: 1 },
+++    };
+++    project = { orchestrationFolder: ORCH, worktreeRoot };
+++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  function concernsDir() {
+++    return path.join(taskDir, "concerns");
+++  }
+++
+++  function concernFiles(prefix = "c-") {
+++    const dir = concernsDir();
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
+++    const harness = new FakeHarness();
+++    const label = `${TASK}/runs/review#a1`;
+++    harness.scriptOutcome(label, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${label}#relaunch`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+++    });
+++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
+++    return runAgentStep({
+++      task: TASK,
+++      stepId: "review",
+++      stepFragment: "steps/review",
+++      agent: "reviewer",
+++      cwd: taskWt,
+++      taskWt,
+++      taskDir,
+++      recordsDir: path.join(taskDir, "runs"),
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts: promptsFor,
+++      promptVars,
+++    }).then((result) => ({ result, harness }));
+++  }
+++
+++  function promptOf(harness: FakeHarness): string {
+++    const call = harness.calls.find((c) => c.type === "run");
+++    if (!call || call.type !== "run") throw new Error("no agent run captured");
+++    return call.run.prompt;
+++  }
+++
+++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-aaaaaaaaaa",
+++      kind: "risk",
+++      summary: "Retry loop can spin",
+++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++    await writeConcern({
+++      id: "c-bbbbbbbbbb",
+++      kind: "blocker",
+++      summary: "Missing adapter",
+++      detail: "e".repeat(600),
+++      severity: "medium",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-aaaaaaaaaa");
+++    expect(hydrated).toContain("Retry loop can spin");
+++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
+++    expect(yaml.parse(hydrated)).toHaveLength(2);
+++
+++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
+++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
+++    expect(small).toContain("c-");
+++  });
+++
+++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
+++    await writeConcern({
+++      id: "c-cccccccccc",
+++      kind: "tech-debt",
+++      summary: "Plan duplicates the retry helper",
+++      detail: "f".repeat(600),
+++      severity: "medium",
+++      affects: ["m1"],
+++    });
+++    await writeConcern({
+++      id: "c-dddddddddd",
+++      kind: "risk",
+++      summary: "Milestone boundary depends on an unbuilt adapter",
+++      detail: "g".repeat(600),
+++      severity: "high",
+++      affects: ["m1"],
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
+++    expect(hydrated).toContain("c-cccccccccc");
+++
+++    // Iteration 2+ has merged code on the branch: classification still uses the
+++    // registered prompt input, not a branch-state diff inference.
+++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
+++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
+++  });
+++
+++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
+++    await writeConcern({
+++      id: "c-eeeeeeeeee",
+++      kind: "tech-debt",
+++      summary: "Shared helper duplicated in two modules",
+++      detail: "h".repeat(3000),
+++      severity: "medium",
+++    });
+++    await writeConcern({
+++      id: "c-ffffffffff",
+++      kind: "assumption",
+++      summary: "Cache survives restart",
+++      detail: "i".repeat(3000),
+++      severity: "low",
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
+++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+++    expect(hydrated).toContain("c-eeeeeeeeee");
+++
+++    const planCloseup = await hydrate(taskDir, {
+++      stepRole: "plan-close-up",
+++      taskDiffBytes: 5000,
+++    });
+++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
+++  });
+++
+++  it("returns empty hydration for zero and tiny caps", async () => {
+++    await writeConcern({
+++      id: "c-1111111111",
+++      kind: "risk",
+++      summary: "Visible only when the cap allows bytes",
+++      detail: "j".repeat(600),
+++    });
+++
+++    const { hydrate } = hydrationApi();
+++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+++    expect(positive).not.toBe("");
+++    expect(idLines(positive).length).toBeGreaterThan(0);
+++
+++    for (const cap of [0, 1, 3]) {
+++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
+++      expect(empty).toBe("");
+++      expect(idLines(empty)).toEqual([]);
+++    }
+++  });
+++
+++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
+++    const summary = "Retry loop can spin";
+++    const cid = "c-2222222222";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary,
+++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
+++      severity: "high",
+++      affects: ["item-a"],
+++    });
+++
+++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
+++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
+++    expect(promptOf(zero.harness)).not.toContain(cid);
+++
+++    const hydrated = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++    });
+++    const prompt = promptOf(hydrated.harness);
+++    expect(prompt).toContain(cid);
+++    expect(prompt).toContain(summary);
+++    expect(prompt).not.toContain("DETAIL_SENTINEL");
+++
+++    const supplied = await runReview({
+++      assignment: "Review",
+++      checks: "",
+++      diff: "d".repeat(3000),
+++      dispositionsCriteria: "",
+++      concernsYaml: "CALLER-CONCERNS: c-caller",
+++    });
+++    const suppliedPrompt = promptOf(supplied.harness);
+++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
+++    expect(suppliedPrompt).not.toContain(cid);
+++  });
+++
+++  it("computes close-up task diff bytes through the injected git function", async () => {
+++    const cid = "c-3333333333";
+++    await writeConcern({
+++      id: cid,
+++      kind: "risk",
+++      summary: "Close-up concern",
+++      detail: "l".repeat(400),
+++      severity: "medium",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "wave-close-up.md"),
+++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
+++
+++    const gitCalls: string[][] = [];
+++    const gitFn = async (_cwd: string, args: string[]) => {
+++      gitCalls.push(args);
+++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
+++    };
+++    const harness = new FakeHarness();
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+++    });
+++    try {
+++      await runAgentStep({
+++        task: TASK,
+++        stepId: "wave-close-up-1-1",
+++        stepFragment: "steps/wave-close-up",
+++        agent: "wave-close-up",
+++        cwd: taskWt,
+++        taskWt,
+++        taskDir,
+++        parentBranch: "topic/demo",
+++        recordsDir: path.join(taskDir, "runs"),
+++        repo,
+++        harness,
+++        pipeline,
+++        project,
+++        prompts: closeupPrompts,
+++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
+++        gitFn,
+++      } as any);
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
+++    const prompt = promptOf(harness);
+++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
+++    expect(block).toContain(cid);
+++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
+++    expect(utf8Bytes(block)).toBeLessThan(5000);
+++  });
+++
+++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
+++    const cid = "c-4444444444";
+++    await writeConcern({
+++      id: cid,
+++      kind: "blocker",
+++      summary: "Database schema migration is pending",
+++      detail: "m".repeat(400),
+++      severity: "high",
+++      status: "routed",
+++      disposition: "architect",
+++      affects: ["seed"],
+++    });
+++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
+++      id: "dec-1",
+++      context: "task",
+++      decision: "continue",
+++      rationale: "漢".repeat(120),
+++      timestamp: "2026-01-01T00:00:00.000Z",
+++    });
+++
+++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
+++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+++    fs.writeFileSync(
+++      path.join(overridesDir, "steps", "architect-plan.md"),
+++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
+++      "utf8"
+++    );
+++    const architectPrompts = loadPromptLibrary({
+++      builtinDir: agentsDir,
+++      overrideDirs: [overridesDir],
+++    });
+++
+++    const harness = new FakeHarness();
+++    let architectPrompt = "";
+++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
+++      architectPrompt = run.prompt;
+++      return {
+++        ok: true,
+++        data: {
+++          iteration: 1,
+++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
+++          itemOutlines: [],
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, items: [] },
+++    });
+++
+++    try {
+++      await runIteration({
+++        task: TASK,
+++        taskDir,
+++        taskWt,
+++        repo,
+++        harness,
+++        pipeline: {
+++          ...pipeline,
+++          limits: {
+++            hydrationBytes: 20,
+++            maxPlanReviewRounds: 1,
+++            maxIterations: 3,
+++            maxParallelItems: 2,
+++            maxParallelTurns: 4,
+++            maxStepAttempts: 3,
+++            maxFixRounds: 3,
+++          },
+++        },
+++        project,
+++        prompts: architectPrompts,
+++      });
+++    } finally {
+++      fs.rmSync(overridesDir, { recursive: true, force: true });
+++    }
+++
+++    expect(architectPrompt).toContain(cid);
+++    expect(occurrences(architectPrompt, cid)).toBe(1);
+++    expect(architectPrompt).not.toContain("--- Concerns ---");
+++
+++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
+++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
+++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
+++    expect(debt).not.toContain("\uFFFD");
+++    expect(steering).not.toContain("\uFFFD");
+++
+++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
+++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
+++    expect(concerns).toContain(cid);
+++  });
+++});
+++
+++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
+++  let tmpRepo: TmpRepo;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function concern(
+++    overrides: Partial<StoredConcernArtifact> & { id: string }
+++  ): StoredConcernArtifact {
+++    return {
+++      kind: "risk",
+++      summary: `Concern ${overrides.id}`,
+++      detail: "detail",
+++      severity: "medium",
+++      status: "open",
+++      source: { record: "001-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    };
+++  }
+++
+++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+++  }
+++
+++  async function writeRemarkable(
+++    id: string,
+++    chosen: string,
+++    overrides: Record<string, unknown> = {}
+++  ) {
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
+++      id,
+++      chosen,
+++      alternatives: ["Other"],
+++      why: "w".repeat(300),
+++      status: "open",
+++      source: { record: "001-architect-plan-a1", agent: "architect" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++      ...overrides,
+++    });
+++  }
+++
+++  it("hydrates open concerns with pending resolutions for review", async () => {
+++    const pending = {
+++      action: "carry" as const,
+++      note: "Needs an architect decision",
+++      by: "wave-close-up",
+++      at: "2026-01-02T00:00:00.000Z",
+++    };
+++    await writeConcern({
+++      id: "c-5555555555",
+++      summary: "Needs a decision",
+++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
+++      pendingResolution: pending,
+++    });
+++
+++    const { list } = hydrationApi();
+++    for (const consumer of ["review", "develop", "qa"]) {
+++      const hydrated = await list(taskDir, consumer);
+++      expect(hydrated).toHaveLength(1);
+++      expect(hydrated[0]).toMatchObject({
+++        id: "c-5555555555",
+++        kind: "risk",
+++        summary: "Needs a decision",
+++        pendingResolution: pending,
+++      });
+++      expect(hydrated[0]).not.toHaveProperty("detail");
+++    }
+++  });
+++
+++  it("includes routed concerns for close-ups but not for review", async () => {
+++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
+++    await writeConcern({
+++      id: "c-7777777777",
+++      status: "routed",
+++      disposition: "architect",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
+++
+++    const closeup = await list(taskDir, "closeup");
+++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
+++  });
+++
+++  it("hydrates open remarkables as terse remarkable records", async () => {
+++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
+++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect).toEqual([
+++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+++    ]);
+++  });
+++
+++  it("includes dismissed escalated concerns only in the architect set", async () => {
+++    await writeConcern({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      dismissReason: "not real",
+++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-ababababab",
+++      status: "dismissed",
+++      dismissReason: "quiet",
+++      createdAt: "2026-01-02T00:00:00.000Z",
+++    });
+++    await writeConcern({
+++      id: "c-acacacacac",
+++      status: "open",
+++      createdAt: "2026-01-03T00:00:00.000Z",
+++    });
+++
+++    const { list } = hydrationApi();
+++    const review = await list(taskDir, "review");
+++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
+++
+++    const architect = await list(taskDir, "architect");
+++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
+++    expect(architect[0]).toMatchObject({
+++      id: "c-9999999999",
+++      status: "dismissed",
+++      escalated: true,
+++    });
+++  });
+++
+++  it("counts concerns only, never remarkables", async () => {
+++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
+++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
+++
+++    await writeConcern({ id: "c-adadadadad", status: "open" });
+++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
+++  });
+++});
+++
+++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
+++  let tmpRepo: TmpRepo;
+++  let repo: Repo;
+++  let taskWt: string;
+++  let taskDir: string;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
+++    taskWt = tmpRepo.dir;
+++    taskDir = path.join(taskWt, ORCH, TASK);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  function source(record = "001-develop-a1"): ConcernSource {
+++    return { record, agent: "developer" };
+++  }
+++
+++  function concernFiles() {
+++    const dir = path.join(taskDir, "concerns");
+++    if (!fs.existsSync(dir)) return [];
+++    return fs
+++      .readdirSync(dir)
+++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
+++      .map((name) => name.slice(0, -".yaml".length))
+++      .sort();
+++  }
+++
+++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
+++  function legacyFingerprint(input: {
+++    kind: string;
+++    summary: string;
+++    location?: { file: string; line?: number };
+++    affects?: string[];
+++  }): string {
+++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
+++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
+++    const parts = [
+++      input.kind,
+++      norm(input.summary),
+++      input.location?.file.trim() ?? null,
+++      input.location?.line ?? null,
+++      affects,
+++    ];
+++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+++  }
+++
+++  it("fingerprints kind, normalized summary, and location without affects", () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "  Flaky   GATE ",
+++      location: { file: "src/core/example.ts", line: 7 },
+++    };
+++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
+++
+++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
+++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
+++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
+++
+++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
+++    expect(
+++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+++    ).not.toBe(id);
+++  });
+++
+++  it("unions affects without forking and preserves terminal status", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Flaky gate blocks merges",
+++      location: { file: "src/core/merge.ts", line: 12 },
+++    };
+++    const id = concernFingerprint(identity);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source() },
+++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    let stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${id}.yaml`)
+++    );
+++    expect(stored.affects).toEqual(["item-a", "item-b"]);
+++    expect(stored.status).toBe("open");
+++    expect(stored.detail).toBe("a much longer detail");
+++    expect(stored.severity).toBe("high");
+++    expect(stored.source.escalated).toBe(true);
+++
+++    await applyConcernTriage({
+++      taskDir,
+++      taskWt,
+++      repo,
+++      isTriager: true,
+++      suggestions: [
+++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
+++      ],
+++    });
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("003-review-a1") },
+++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
+++    );
+++    expect(concernFiles()).toEqual([id]);
+++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
+++    expect(stored.status).toBe("dismissed");
+++    expect(stored.dismissReason).toBe("covered by ADR-1");
+++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
+++    expect(stored.source.escalated).toBe(true);
+++  });
+++
+++  it("renames a legacy affects-keyed file to the stable id", async () => {
+++    const identity = {
+++      kind: "risk" as const,
+++      summary: "Legacy concern",
+++      location: { file: "src/legacy.ts", line: 4 },
+++    };
+++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
+++    const stableId = concernFingerprint(identity);
+++    expect(legacyId).not.toBe(stableId);
+++
+++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
+++      id: legacyId,
+++      ...identity,
+++      detail: "legacy detail",
+++      severity: "medium",
+++      status: "open",
+++      affects: ["old"],
+++      source: { record: "000-develop-a1", agent: "developer" },
+++      createdAt: "2026-01-01T00:00:00.000Z",
+++      updatedAt: "2026-01-01T00:00:00.000Z",
+++    });
+++    expect(concernFiles()).toEqual([legacyId]);
+++
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
+++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
+++    );
+++
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
+++    const stored = await readYaml<StoredConcernArtifact>(
+++      path.join(taskDir, "concerns", `${stableId}.yaml`)
+++    );
+++    expect(stored.id).toBe(stableId);
+++    expect(stored.affects).toEqual(["new", "old"]);
+++    expect(stored.detail).toBe("new detail");
+++    expect(stored.severity).toBe("high");
+++
+++    // Re-emitting with another affect keeps the same stable triage id.
+++    await aggregateConcerns(
+++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+++      [{ ...identity, affects: ["new", "third"] }]
+++    );
+++    expect(concernFiles()).toEqual([stableId]);
+++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
+++  });
+++});
++diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++index fb7cc9b..df5eac8 100644
++--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
++@@ -16,9 +16,9 @@ import {
++   concernMailboxId,
++   isDebtConcern,
++   partitionReviewSuggestions,
++-  renderConcernsYaml,
++   type ReviewTriageOutcome,
++ } from "../../src/core/triage.js";
+++import * as triageModule from "../../src/core/triage.js";
++ import type {
++   PipelineConfig,
++   ProjectConfig,
++@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         assignment: "Review the item",
++         checks: "",
++         testDiff: "",
++-        diff: "",
+++        diff: "d".repeat(3000),
++         dispositionsCriteria: "",
++       },
++     });
++@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++     expect(qa.fixRequired).toBe(false);
++   });
++ 
++-  it("renders condensing concern YAML without detail and within the byte cap", () => {
+++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
++     const concerns = [
++       storedConcern({
++         id: "c-aaaaaaaaaa",
++@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
++         detail: "e".repeat(600),
++       }),
++     ];
++-
++-    const rendered = renderConcernsYaml(concerns);
+++    for (const concern of concerns) await writeConcern(concern);
+++
+++    const hydrate = (
+++      triageModule as unknown as {
+++        hydrateStepConcerns?: (
+++          taskDir: string,
+++          request: { stepRole: string; diffBytes: number }
+++        ) => Promise<string>;
+++      }
+++    ).hydrateStepConcerns;
+++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
+++
+++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
++     const parsed = yaml.parse(rendered);
++     expect(Array.isArray(parsed)).toBe(true);
++     expect(parsed).toHaveLength(2);
++@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
++       Buffer.byteLength(JSON.stringify(concerns), "utf8")
++     );
++ 
++-    const capped = renderConcernsYaml(concerns, 120);
+++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
++     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
++     expect(capped).not.toContain("\uFFFD");
++   });
++diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++index 3eb7799..58961a9 100644
++--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
++     prompts = loadPromptLibrary({
++       builtinDir: path.resolve(import.meta.dir, "../../agents"),
++       overrideDirs: [],
+++      // The single hydration source is concernsYaml; prompt fragments gain the
+++      // placeholder in the prompt-fragments item, so this test supplies it here.
+++      overrides: {
+++        "steps/architect-plan":
+++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
+++        "steps/architect-wave-report":
+++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
+++      },
++     });
++   });
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
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..87d3ff9
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 4
++name: review
++attempt: 1
++fixRound: 1
++agent: reviewer
++role: alt-workhorse
++models:
++  - opencode-go/muse-spark-1.3-contributor
++  - opencode-go/deepseek-v4.1-flash
++timeoutSec: 3600
++status: ok
++startedAt: 2026-11-08T20:56:04.392Z
++session: 01a1bcf2-6678-77ea-95dd-a86a81b75880
++endedAt: 2026-11-08T21:48:09.337Z
++usage:
++  inputTokens: 81514
++  outputTokens: 72122
++  costUsd: 0.03002
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T20-56-04-984Z_01a1bcf2-6678-77ea-95dd-a86a81b75880.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml
+new file mode 100644
+index 0000000..ed61f3f
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/004-review-r1-a1/output.yaml
+@@ -0,0 +1,30 @@
++status: changes_requested
++summary: Legacy migration clobbers stored detail on detail-less input;
++  caps/sets/fingerprint/unions otherwise verified
++suggestions:
++  - id: legacy-migration-detail-clobber
++    disposition: fix
++    summary: Legacy rename-merge overwrites stored detail with summary fallback when
++      incoming detail is omitted
++    detail: concerns.ts:120 unconditionally sets merged.detail=(input.detail ??
++      input.summary).trim() on legacy migration, bypassing mergeConcern's
++      longer-wins. ConcernInput.detail is optional and aggregate validation
++      doesn't require it (concerns.ts:12-13,101-105), and the test suite itself
++      emits detail-less concerns ({...identity, affects}) — so a detail-less
++      emission triggering migration would degrade a rich stored legacy detail to
++      the bare summary. Gate the overwrite on incoming detail presence (e.g.
++      only when input.detail?.trim() is non-empty), preserving the test-mandated
++      incoming-wins when detail is supplied (migration test provides 'new
++      detail').
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 120
++  - id: dead-yaml-import
++    disposition: optional
++    summary: Remove dead yaml import left after hydrateConcernsYaml deletion
++    detail: concerns.ts:4 imports yaml but zero yaml.* call sites remain (verified
++      via grep; only '.yaml' filename strings). Typecheck doesn't flag it, but
++      prune per wrapper/redundancy discipline.
++    location:
++      file: plugins/software-factory/src/core/concerns.ts
++      line: 4
+diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
+index 5e2078d..197bc81 100644
+--- a/plugins/software-factory/src/core/concerns.ts
++++ b/plugins/software-factory/src/core/concerns.ts
+@@ -27,11 +27,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
+ const hash = (prefix: string, parts: unknown[]) =>
+   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+ const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
+-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
++const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
+ 
+-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
++/** Stable concern identity: kind, normalized summary, location. */
+ export function concernFingerprint(c: ConcernInput): string {
+-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
++  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
+ }
+ 
+ async function readExisting<T>(file: string): Promise<T | undefined> {
+@@ -48,7 +49,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
+   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
+   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
+   const location = input.location ?? existing?.location;
+-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
++  const affects = input.affects
++    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
++    : existing?.affects;
+   return {
+     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
+     summary: existing?.summary ?? input.summary.trim(), detail,
+@@ -69,6 +72,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
+   };
+ }
+ 
++/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
++async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT") return undefined;
++    throw err;
++  }
++  const [file, line] = locationOf(input.location);
++  for (const name of names.sort()) {
++    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
++    const candidate = path.join(dir, name);
++    try {
++      const record = await readYaml<StoredConcernArtifact>(candidate);
++      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
++      const [rfile, rline] = locationOf(record.location);
++      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
++      return { file: candidate, record };
++    } catch { /* Corrupt entries are not migration candidates. */ }
++  }
++  return undefined;
++}
++
+ /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
+ export async function aggregateConcerns(
+   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
+@@ -85,10 +110,17 @@ export async function aggregateConcerns(
+     const out: StoredConcernArtifact[] = [];
+     for (const input of concerns) {
+       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
+-      const existing = await readExisting<StoredConcernArtifact>(file);
++      let existing = await readExisting<StoredConcernArtifact>(file);
++      let legacyFile: string | undefined;
++      if (!existing) {
++        const migrated = await legacyConcern(dir, input);
++        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
++      }
+       const merged = mergeConcern(existing, input, ctx.source, at);
+-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
++      if (legacyFile) merged.detail = (input.detail ?? input.summary).trim();
++      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+       await writeYamlAtomic(file, merged);
++      if (legacyFile) await fs.promises.unlink(legacyFile);
+       dirty = true; out.push(merged);
+     }
+     for (const decision of remarkables) {
+@@ -168,27 +200,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
+   }
+ }
+ 
+-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
+-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
+-  const dir = dirOf(taskDir);
+-  let names: string[];
+-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+-    if (err?.code === "ENOENT") return "[]";
+-    throw err;
+-  }
+-  const items = await Promise.all(
+-    names
+-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
+-      .map(async (name) => {
+-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+-      })
+-  );
+-  const open = items
+-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
+-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
+-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
+-}
+-
+ async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
+   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
+   const updated = await locks.runExclusive(ctx.taskDir, async () => {
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index 84a77f6..0cc7f10 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
+ import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
+ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+-  hydrateConcernsYaml,
+   listConcernIds,
+   listConcerns,
+   partitionSuggestions,
+ } from "../concerns.js";
+-import { renderConcernsYaml } from "../triage.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -169,23 +167,13 @@ async function buildArchitectHydration(
+     }
+   }
+ 
+-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+-  // every architect turn the terse decision context the act phase acts on.
+-  // Appended last so the byte cap never evicts it.
+-  const actionableConcerns = (await listConcerns(taskDir)).filter(
+-    (c) => c.status === "open" || c.status === "routed"
+-  );
+-  if (actionableConcerns.length > 0) {
+-    parts.push(
+-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+-    );
+-  }
+-
++  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
+   const combined = parts.join("\n\n");
+-  if (combined.length <= maxBytes) {
+-    return combined;
+-  }
+-  return combined.slice(combined.length - maxBytes);
++  const buf = Buffer.from(combined, "utf8");
++  if (buf.length <= maxBytes) return combined;
++  let start = buf.length - maxBytes;
++  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
++  return buf.subarray(start).toString("utf8");
+ }
+ 
+ /**
+@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+     // Triage ids are those that existed before this review round; capturing
+     // them here mirrors the step-runner exact-id partition.
+     const knownConcernIds = await listConcernIds(taskDir);
+-    const concernsYaml = await hydrateConcernsYaml(taskDir);
+     // Check if review round record already exists
+     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
+     const revStepRes = await runAgentStep({
+@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         plan: JSON.stringify(plan, null, 2),
+         intent: intentText,
+         context: contextYaml,
+-        concernsYaml,
+         limits: JSON.stringify(limits, null, 2),
+         dispositionsCriteria: formatDispositionsSection(
+           loadCriteriaBundle(pipeline.criteria).dispositions,
+@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         waveReport: waveSummary,
+         infra: infraYaml,
+       },
++      parentBranch,
+       turnsSemaphore,
+       budgetTracker,
+       iteration,
+@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       plan: JSON.stringify(plan, null, 2),
+       context: contextYaml,
+     },
++    parentBranch,
+     turnsSemaphore,
+     budgetTracker,
+     iteration,
+diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
+index 3b158c4..69fba68 100644
+--- a/plugins/software-factory/src/core/flows/step-runner.ts
++++ b/plugins/software-factory/src/core/flows/step-runner.ts
+@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   aggregateConcerns,
+   applyCloseupResolutions,
+-  listOpenConcerns,
+ } from "../concerns.js";
+ import {
+   applyReviewTriage,
+-  renderConcernsYaml,
++  hydrateStepConcerns,
+   TriageValidationError,
+   type ReviewTriageOutcome,
+ } from "../triage.js";
++import { KNOWN_VARS } from "../prompt-vars.js";
+ import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
+ import { captureHead, enforceHead } from "../git/guard.js";
+ import { commitAll } from "../git/commit.js";
+@@ -70,6 +70,8 @@ export interface StepRunOptions {
+   project: ProjectConfig;
+   prompts: any;
+   promptVars: Record<string, string>;
++  parentBranch?: string;
++  gitFn?: typeof git;
+   turnsSemaphore?: Semaphore;
+   customSchema?: JSONSchema;
+   log?: (msg: string) => void;
+@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
+   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
+   const fragment = stepFragment ?? `steps/${stepId}`;
+   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
+-  const openConcerns = await listOpenConcerns(taskDir);
+-  const concernsYaml = openConcerns.length > 0
+-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
+-    : "";
+   const effectivePromptVars: Record<string, string> = {
+     humanInvolvementCriteria: formatHumanInvolvementCriteria(
+       criteriaBundle.humanInvolvement,
+       pipeline.humanInvolvement
+     ),
+-    concernsYaml,
+     ...promptVars,
+   };
++  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
++  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
++    const stepRole = fragment.replace(/^steps\//, "");
++    if (stepRole === "review" || stepRole === "qa") {
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
++      });
++    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
++      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
++        stepRole,
++        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
++      });
++    } else {
++      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
++      const inputBytes = knownVars
++        .filter((key) => !excluded.has(key))
++        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
++      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
++    }
++  }
+   let promptText: string;
+   let agentDef: { body: string; tools: string[]; description: string };
+   try {
+diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
+index 923a9d1..479287e 100644
+--- a/plugins/software-factory/src/core/triage.ts
++++ b/plugins/software-factory/src/core/triage.ts
+@@ -1,7 +1,10 @@
++import fs from "node:fs";
++import path from "node:path";
+ import yaml from "yaml";
+ import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
+-import { applyConcernTriage } from "./concerns.js";
++import { applyConcernTriage, listConcerns } from "./concerns.js";
+ import type { Repo } from "./git/repo.js";
++import { readYaml } from "./records/io.js";
+ import { writeQuestion } from "./steer.js";
+ 
+ /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
+@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
+     severity: c.severity,
+     summary: c.summary,
+     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
++    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
++    ...(c.status !== "open" ? { status: c.status } : {}),
++    ...(c.disposition ? { disposition: c.disposition } : {}),
++    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
++    ...(c.source?.escalated ? { escalated: true } : {}),
+   };
+ }
+ 
++export interface HydrateStepConcernsRequest {
++  stepRole: string;
++  inputBytes?: number;
++  diffBytes?: number;
++  taskDiffBytes?: number;
++  consumer?: string;
++}
++
+ const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+ const serialize = (records: Array<Record<string, unknown>>) =>
+   yaml.stringify(records, { lineWidth: 0 });
+ const truncateChars = (text: string, max: number) =>
+   Array.from(text).slice(0, max).join("");
+ 
++/** Normalizes step ids/fragments to their hydration role family. */
++function hydrationRole(stepRole: string): string {
++  const role = stepRole.replace(/^steps\//, "");
++  if (role === "architect" || role.startsWith("architect-")) return "architect";
++  if (role.startsWith("plan-review")) return "plan-review";
++  if (role.startsWith("plan-close-up")) return "plan-close-up";
++  if (role.startsWith("wave-close-up")) return "wave-close-up";
++  if (role === "review" || role === "qa") return role;
++  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
++  return role;
++}
++
++function hydrationConsumer(role: string, consumer?: string): string {
++  if (consumer) return consumer;
++  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
++  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
++  return role === "architect" ? "architect" : role;
++}
++
++async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
++  const dir = path.join(taskDir, "concerns");
++  let names: string[];
++  try { names = await fs.promises.readdir(dir); } catch (err: any) {
++    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
++    throw err;
++  }
++  const records = await Promise.all(
++    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
++      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
++    })
++  );
++  return records
++    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
++    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
++    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
++}
++
++/** Hydrated concern set per consumer (adr-hydrated-sets). */
++export async function listHydratedConcerns(
++  taskDir: string,
++  consumer: string
++): Promise<Array<Record<string, unknown>>> {
++  const includeRouted = consumer === "closeup" || consumer === "architect";
++  const includeEscalated = consumer === "architect";
++  const concerns = (await listConcerns(taskDir)).filter((c) =>
++    c.status === "open" ||
++    (includeRouted && c.status === "routed") ||
++    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
++  );
++  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
++}
++
++/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
++export async function hydrateStepConcerns(
++  taskDir: string,
++  request: HydrateStepConcernsRequest
++): Promise<string> {
++  const role = hydrationRole(request.stepRole);
++  const cap = role === "review" || role === "qa"
++    ? Math.min(request.diffBytes ?? 0, 2000)
++    : role === "wave-close-up" || role === "plan-close-up"
++      ? Math.min(request.taskDiffBytes ?? 0, 2000)
++      : Math.min(request.inputBytes ?? 0, 500);
++  if (cap <= 0) return "";
++  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
++  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
++}
++
+ /**
+- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
+- * Detail is dropped; over-budget output condenses summaries, drops affects,
+- * then sheds trailing entries until the UTF-8 byte ceiling is met.
++ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
++ * condenses summaries, drops affects, then sheds trailing entries; empty output
++ * is returned when no record fits the ceiling.
+  */
+ export function renderConcernsYaml(
+-  concerns: StoredConcernArtifact[],
++  records: Array<Record<string, unknown>>,
+   maxBytes = 8000
+ ): string {
+-  const records = concerns.map(terseConcern);
++  if (maxBytes <= 0 || records.length === 0) return "";
+   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
+     { records },
+     { records: records.map(({ affects: _affects, ...rest }) => rest) },
+@@ -110,7 +194,7 @@ export function renderConcernsYaml(
+       if (utf8Bytes(text) <= maxBytes) return text;
+     }
+   }
+-  return serialize([]);
++  return "";
+ }
+ 
+ /**
+diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+index a1f0728..ff3f5e8 100644
+--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
++++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
+@@ -317,7 +317,7 @@ describe("Concern store", () => {
+     });
+   }
+ 
+-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
++  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
+     const identity = {
+       kind: "risk" as const,
+       summary: "  Flaky   GATE ",
+@@ -339,7 +339,9 @@ describe("Concern store", () => {
+     expect(
+       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+     ).not.toBe(fp);
+-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
++    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
+   });
+ 
+   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
+diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+new file mode 100644
+index 0000000..d75dcb9
+--- /dev/null
++++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
+@@ -0,0 +1,839 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import os from "node:os";
++import { createHash } from "node:crypto";
++import yaml from "yaml";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runAgentStep } from "../../src/core/flows/step-runner.js";
++import { runIteration } from "../../src/core/flows/iteration.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
++import {
++  aggregateConcerns,
++  applyConcernTriage,
++  concernFingerprint,
++  countConcerns,
++  listConcerns,
++} from "../../src/core/concerns.js";
++import * as triageModule from "../../src/core/triage.js";
++import type {
++  ConcernSource,
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
++ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
++ *
++ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
++ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
++ * plan-review/architect/develop-family from their registered prompt input.
++ */
++
++const ORCH = ".factory";
++const TASK = "hydration-caps";
++const agentsDir = path.resolve(import.meta.dir, "../../agents");
++
++type Hydrate = (
++  taskDir: string,
++  request: {
++    stepRole: string;
++    inputBytes?: number;
++    diffBytes?: number;
++    taskDiffBytes?: number;
++    consumer?: string;
++  }
++) => Promise<string>;
++type ListHydrated = (
++  taskDir: string,
++  consumer: string
++) => Promise<Array<Record<string, any>>>;
++
++/**
++ * New triage exports are looked up dynamically so this file collects against the
++ * pre-implementation module and fails on behavior, not on a missing import.
++ */
++function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
++  const mod = triageModule as unknown as {
++    hydrateStepConcerns?: Hydrate;
++    listHydratedConcerns?: ListHydrated;
++  };
++  const hydrate = mod.hydrateStepConcerns;
++  const list = mod.listHydratedConcerns;
++  if (!hydrate || !list) {
++    return {
++      hydrate: (() => {
++        throw new Error("hydrateStepConcerns is not implemented");
++      }) as unknown as Hydrate,
++      list: (() => {
++        throw new Error("listHydratedConcerns is not implemented");
++      }) as unknown as ListHydrated,
++    };
++  }
++  return { hydrate, list };
++}
++
++const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
++const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
++const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
++
++describe("Hydration caps (adr-hydration-single-cap)", () => {
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
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
++    tmpRepo.commit("add hydration caps task");
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
++        reviewer: { role: "alt-workhorse" },
++        qa: { role: "alt-workhorse" },
++        architect: { role: "architect" },
++        "plan-reviewer": { role: "alt-architect" },
++        pm: { role: "alt-workhorse" },
++        "wave-close-up": { role: "alt-workhorse" },
++        "plan-close-up": { role: "alt-workhorse" },
++      },
++      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
++      limits: { maxPlanReviewRounds: 1 },
++    };
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  function concernsDir() {
++    return path.join(taskDir, "concerns");
++  }
++
++  function concernFiles(prefix = "c-") {
++    const dir = concernsDir();
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
++    const harness = new FakeHarness();
++    const label = `${TASK}/runs/review#a1`;
++    harness.scriptOutcome(label, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    harness.scriptOutcome(`${label}#relaunch`, {
++      ok: true,
++      data: { status: "approved", summary: "Looks fine", suggestions: [] },
++    });
++    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
++    return runAgentStep({
++      task: TASK,
++      stepId: "review",
++      stepFragment: "steps/review",
++      agent: "reviewer",
++      cwd: taskWt,
++      taskWt,
++      taskDir,
++      recordsDir: path.join(taskDir, "runs"),
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts: promptsFor,
++      promptVars,
++    }).then((result) => ({ result, harness }));
++  }
++
++  function promptOf(harness: FakeHarness): string {
++    const call = harness.calls.find((c) => c.type === "run");
++    if (!call || call.type !== "run") throw new Error("no agent run captured");
++    return call.run.prompt;
++  }
++
++  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-aaaaaaaaaa",
++      kind: "risk",
++      summary: "Retry loop can spin",
++      detail: "DETAIL_SENTINEL" + "d".repeat(600),
++      severity: "high",
++      affects: ["item-a"],
++    });
++    await writeConcern({
++      id: "c-bbbbbbbbbb",
++      kind: "blocker",
++      summary: "Missing adapter",
++      detail: "e".repeat(600),
++      severity: "medium",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-aaaaaaaaaa");
++    expect(hydrated).toContain("Retry loop can spin");
++    expect(hydrated).not.toContain("DETAIL_SENTINEL");
++    expect(yaml.parse(hydrated)).toHaveLength(2);
++
++    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
++    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
++    expect(small).toContain("c-");
++  });
++
++  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
++    await writeConcern({
++      id: "c-cccccccccc",
++      kind: "tech-debt",
++      summary: "Plan duplicates the retry helper",
++      detail: "f".repeat(600),
++      severity: "medium",
++      affects: ["m1"],
++    });
++    await writeConcern({
++      id: "c-dddddddddd",
++      kind: "risk",
++      summary: "Milestone boundary depends on an unbuilt adapter",
++      detail: "g".repeat(600),
++      severity: "high",
++      affects: ["m1"],
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
++    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
++    expect(hydrated).toContain("c-cccccccccc");
++
++    // Iteration 2+ has merged code on the branch: classification still uses the
++    // registered prompt input, not a branch-state diff inference.
++    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
++    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
++  });
++
++  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
++    await writeConcern({
++      id: "c-eeeeeeeeee",
++      kind: "tech-debt",
++      summary: "Shared helper duplicated in two modules",
++      detail: "h".repeat(3000),
++      severity: "medium",
++    });
++    await writeConcern({
++      id: "c-ffffffffff",
++      kind: "assumption",
++      summary: "Cache survives restart",
++      detail: "i".repeat(3000),
++      severity: "low",
++    });
++
++    const { hydrate } = hydrationApi();
++    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
++    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
++    expect(hydrated).toContain("c-eeeeeeeeee");
++
++    const planCloseup = await hydrate(taskDir, {
++      stepRole: "plan-close-up",
++      taskDiffBytes: 5000,
++    });
++    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
++  });
++
++  it("returns empty hydration for zero and tiny caps", async () => {
++    await writeConcern({
++      id: "c-1111111111",
++      kind: "risk",
++      summary: "Visible only when the cap allows bytes",
++      detail: "j".repeat(600),
++    });
++
++    const { hydrate } = hydrationApi();
++    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
++    expect(positive).not.toBe("");
++    expect(idLines(positive).length).toBeGreaterThan(0);
++
++    for (const cap of [0, 1, 3]) {
++      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
++      expect(empty).toBe("");
++      expect(idLines(empty)).toEqual([]);
++    }
++  });
++
++  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
++    const summary = "Retry loop can spin";
++    const cid = "c-2222222222";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary,
++      detail: "DETAIL_SENTINEL" + "k".repeat(400),
++      severity: "high",
++      affects: ["item-a"],
++    });
++
++    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
++    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
++    expect(promptOf(zero.harness)).not.toContain(cid);
++
++    const hydrated = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++    });
++    const prompt = promptOf(hydrated.harness);
++    expect(prompt).toContain(cid);
++    expect(prompt).toContain(summary);
++    expect(prompt).not.toContain("DETAIL_SENTINEL");
++
++    const supplied = await runReview({
++      assignment: "Review",
++      checks: "",
++      diff: "d".repeat(3000),
++      dispositionsCriteria: "",
++      concernsYaml: "CALLER-CONCERNS: c-caller",
++    });
++    const suppliedPrompt = promptOf(supplied.harness);
++    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
++    expect(suppliedPrompt).not.toContain(cid);
++  });
++
++  it("computes close-up task diff bytes through the injected git function", async () => {
++    const cid = "c-3333333333";
++    await writeConcern({
++      id: cid,
++      kind: "risk",
++      summary: "Close-up concern",
++      detail: "l".repeat(400),
++      severity: "medium",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "wave-close-up.md"),
++      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
++
++    const gitCalls: string[][] = [];
++    const gitFn = async (_cwd: string, args: string[]) => {
++      gitCalls.push(args);
++      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
++    };
++    const harness = new FakeHarness();
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
++    });
++    try {
++      await runAgentStep({
++        task: TASK,
++        stepId: "wave-close-up-1-1",
++        stepFragment: "steps/wave-close-up",
++        agent: "wave-close-up",
++        cwd: taskWt,
++        taskWt,
++        taskDir,
++        parentBranch: "topic/demo",
++        recordsDir: path.join(taskDir, "runs"),
++        repo,
++        harness,
++        pipeline,
++        project,
++        prompts: closeupPrompts,
++        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
++        gitFn,
++      } as any);
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
++    const prompt = promptOf(harness);
++    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
++    expect(block).toContain(cid);
++    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
++    expect(utf8Bytes(block)).toBeLessThan(5000);
++  });
++
++  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
++    const cid = "c-4444444444";
++    await writeConcern({
++      id: cid,
++      kind: "blocker",
++      summary: "Database schema migration is pending",
++      detail: "m".repeat(400),
++      severity: "high",
++      status: "routed",
++      disposition: "architect",
++      affects: ["seed"],
++    });
++    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
++      id: "dec-1",
++      context: "task",
++      decision: "continue",
++      rationale: "漢".repeat(120),
++      timestamp: "2026-01-01T00:00:00.000Z",
++    });
++
++    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
++    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
++    fs.writeFileSync(
++      path.join(overridesDir, "steps", "architect-plan.md"),
++      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
++      "utf8"
++    );
++    const architectPrompts = loadPromptLibrary({
++      builtinDir: agentsDir,
++      overrideDirs: [overridesDir],
++    });
++
++    const harness = new FakeHarness();
++    let architectPrompt = "";
++    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
++      architectPrompt = run.prompt;
++      return {
++        ok: true,
++        data: {
++          iteration: 1,
++          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
++          itemOutlines: [],
++        },
++      };
++    });
++    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan ok", suggestions: [] },
++    });
++    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: { iteration: 1, items: [] },
++    });
++
++    try {
++      await runIteration({
++        task: TASK,
++        taskDir,
++        taskWt,
++        repo,
++        harness,
++        pipeline: {
++          ...pipeline,
++          limits: {
++            hydrationBytes: 20,
++            maxPlanReviewRounds: 1,
++            maxIterations: 3,
++            maxParallelItems: 2,
++            maxParallelTurns: 4,
++            maxStepAttempts: 3,
++            maxFixRounds: 3,
++          },
++        },
++        project,
++        prompts: architectPrompts,
++      });
++    } finally {
++      fs.rmSync(overridesDir, { recursive: true, force: true });
++    }
++
++    expect(architectPrompt).toContain(cid);
++    expect(occurrences(architectPrompt, cid)).toBe(1);
++    expect(architectPrompt).not.toContain("--- Concerns ---");
++
++    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
++    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
++    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
++    expect(debt).not.toContain("\uFFFD");
++    expect(steering).not.toContain("\uFFFD");
++
++    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
++    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
++    expect(concerns).toContain(cid);
++  });
++});
++
++describe("Hydrated concern sets (adr-hydrated-sets)", () => {
++  let tmpRepo: TmpRepo;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function concern(
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
++  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
++  }
++
++  async function writeRemarkable(
++    id: string,
++    chosen: string,
++    overrides: Record<string, unknown> = {}
++  ) {
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
++      id,
++      chosen,
++      alternatives: ["Other"],
++      why: "w".repeat(300),
++      status: "open",
++      source: { record: "001-architect-plan-a1", agent: "architect" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++      ...overrides,
++    });
++  }
++
++  it("hydrates open concerns with pending resolutions for review", async () => {
++    const pending = {
++      action: "carry" as const,
++      note: "Needs an architect decision",
++      by: "wave-close-up",
++      at: "2026-01-02T00:00:00.000Z",
++    };
++    await writeConcern({
++      id: "c-5555555555",
++      summary: "Needs a decision",
++      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
++      pendingResolution: pending,
++    });
++
++    const { list } = hydrationApi();
++    for (const consumer of ["review", "develop", "qa"]) {
++      const hydrated = await list(taskDir, consumer);
++      expect(hydrated).toHaveLength(1);
++      expect(hydrated[0]).toMatchObject({
++        id: "c-5555555555",
++        kind: "risk",
++        summary: "Needs a decision",
++        pendingResolution: pending,
++      });
++      expect(hydrated[0]).not.toHaveProperty("detail");
++    }
++  });
++
++  it("includes routed concerns for close-ups but not for review", async () => {
++    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
++    await writeConcern({
++      id: "c-7777777777",
++      status: "routed",
++      disposition: "architect",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
++
++    const closeup = await list(taskDir, "closeup");
++    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
++  });
++
++  it("hydrates open remarkables as terse remarkable records", async () => {
++    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
++    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect).toEqual([
++      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
++    ]);
++  });
++
++  it("includes dismissed escalated concerns only in the architect set", async () => {
++    await writeConcern({
++      id: "c-9999999999",
++      status: "dismissed",
++      dismissReason: "not real",
++      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
++      createdAt: "2026-01-01T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-ababababab",
++      status: "dismissed",
++      dismissReason: "quiet",
++      createdAt: "2026-01-02T00:00:00.000Z",
++    });
++    await writeConcern({
++      id: "c-acacacacac",
++      status: "open",
++      createdAt: "2026-01-03T00:00:00.000Z",
++    });
++
++    const { list } = hydrationApi();
++    const review = await list(taskDir, "review");
++    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
++
++    const architect = await list(taskDir, "architect");
++    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
++    expect(architect[0]).toMatchObject({
++      id: "c-9999999999",
++      status: "dismissed",
++      escalated: true,
++    });
++  });
++
++  it("counts concerns only, never remarkables", async () => {
++    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
++    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
++
++    await writeConcern({ id: "c-adadadadad", status: "open" });
++    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
++  });
++});
++
++describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
++  let tmpRepo: TmpRepo;
++  let repo: Repo;
++  let taskWt: string;
++  let taskDir: string;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
++    taskWt = tmpRepo.dir;
++    taskDir = path.join(taskWt, ORCH, TASK);
++    fs.mkdirSync(taskDir, { recursive: true });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  function source(record = "001-develop-a1"): ConcernSource {
++    return { record, agent: "developer" };
++  }
++
++  function concernFiles() {
++    const dir = path.join(taskDir, "concerns");
++    if (!fs.existsSync(dir)) return [];
++    return fs
++      .readdirSync(dir)
++      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
++      .map((name) => name.slice(0, -".yaml".length))
++      .sort();
++  }
++
++  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
++  function legacyFingerprint(input: {
++    kind: string;
++    summary: string;
++    location?: { file: string; line?: number };
++    affects?: string[];
++  }): string {
++    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
++    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
++    const parts = [
++      input.kind,
++      norm(input.summary),
++      input.location?.file.trim() ?? null,
++      input.location?.line ?? null,
++      affects,
++    ];
++    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
++  }
++
++  it("fingerprints kind, normalized summary, and location without affects", () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "  Flaky   GATE ",
++      location: { file: "src/core/example.ts", line: 7 },
++    };
++    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
++
++    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
++    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
++    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
++    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
++
++    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
++    expect(
++      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
++    ).not.toBe(id);
++  });
++
++  it("unions affects without forking and preserves terminal status", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Flaky gate blocks merges",
++      location: { file: "src/core/merge.ts", line: 12 },
++    };
++    const id = concernFingerprint(identity);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source() },
++      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    let stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${id}.yaml`)
++    );
++    expect(stored.affects).toEqual(["item-a", "item-b"]);
++    expect(stored.status).toBe("open");
++    expect(stored.detail).toBe("a much longer detail");
++    expect(stored.severity).toBe("high");
++    expect(stored.source.escalated).toBe(true);
++
++    await applyConcernTriage({
++      taskDir,
++      taskWt,
++      repo,
++      isTriager: true,
++      suggestions: [
++        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
++      ],
++    });
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("003-review-a1") },
++      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
++    );
++    expect(concernFiles()).toEqual([id]);
++    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
++    expect(stored.status).toBe("dismissed");
++    expect(stored.dismissReason).toBe("covered by ADR-1");
++    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
++    expect(stored.source.escalated).toBe(true);
++  });
++
++  it("renames a legacy affects-keyed file to the stable id", async () => {
++    const identity = {
++      kind: "risk" as const,
++      summary: "Legacy concern",
++      location: { file: "src/legacy.ts", line: 4 },
++    };
++    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
++    const stableId = concernFingerprint(identity);
++    expect(legacyId).not.toBe(stableId);
++
++    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
++      id: legacyId,
++      ...identity,
++      detail: "legacy detail",
++      severity: "medium",
++      status: "open",
++      affects: ["old"],
++      source: { record: "000-develop-a1", agent: "developer" },
++      createdAt: "2026-01-01T00:00:00.000Z",
++      updatedAt: "2026-01-01T00:00:00.000Z",
++    });
++    expect(concernFiles()).toEqual([legacyId]);
++
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("001-develop-a1") },
++      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
++    );
++
++    expect(concernFiles()).toEqual([stableId]);
++    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
++    const stored = await readYaml<StoredConcernArtifact>(
++      path.join(taskDir, "concerns", `${stableId}.yaml`)
++    );
++    expect(stored.id).toBe(stableId);
++    expect(stored.affects).toEqual(["new", "old"]);
++    expect(stored.detail).toBe("new detail");
++    expect(stored.severity).toBe("high");
++
++    // Re-emitting with another affect keeps the same stable triage id.
++    await aggregateConcerns(
++      { taskDir, taskWt, repo, source: source("002-develop-a1") },
++      [{ ...identity, affects: ["new", "third"] }]
++    );
++    expect(concernFiles()).toEqual([stableId]);
++    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
++  });
++});
+diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+index fb7cc9b..df5eac8 100644
+--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
++++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
+@@ -16,9 +16,9 @@ import {
+   concernMailboxId,
+   isDebtConcern,
+   partitionReviewSuggestions,
+-  renderConcernsYaml,
+   type ReviewTriageOutcome,
+ } from "../../src/core/triage.js";
++import * as triageModule from "../../src/core/triage.js";
+ import type {
+   PipelineConfig,
+   ProjectConfig,
+@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         assignment: "Review the item",
+         checks: "",
+         testDiff: "",
+-        diff: "",
++        diff: "d".repeat(3000),
+         dispositionsCriteria: "",
+       },
+     });
+@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+     expect(qa.fixRequired).toBe(false);
+   });
+ 
+-  it("renders condensing concern YAML without detail and within the byte cap", () => {
++  it("renders condensed concern YAML without detail and within the byte cap", async () => {
+     const concerns = [
+       storedConcern({
+         id: "c-aaaaaaaaaa",
+@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
+         detail: "e".repeat(600),
+       }),
+     ];
+-
+-    const rendered = renderConcernsYaml(concerns);
++    for (const concern of concerns) await writeConcern(concern);
++
++    const hydrate = (
++      triageModule as unknown as {
++        hydrateStepConcerns?: (
++          taskDir: string,
++          request: { stepRole: string; diffBytes: number }
++        ) => Promise<string>;
++      }
++    ).hydrateStepConcerns;
++    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
++
++    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
+     const parsed = yaml.parse(rendered);
+     expect(Array.isArray(parsed)).toBe(true);
+     expect(parsed).toHaveLength(2);
+@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
+       Buffer.byteLength(JSON.stringify(concerns), "utf8")
+     );
+ 
+-    const capped = renderConcernsYaml(concerns, 120);
++    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
+     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
+     expect(capped).not.toContain("\uFFFD");
+   });
+diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+index 3eb7799..58961a9 100644
+--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
+     prompts = loadPromptLibrary({
+       builtinDir: path.resolve(import.meta.dir, "../../agents"),
+       overrideDirs: [],
++      // The single hydration source is concernsYaml; prompt fragments gain the
++      // placeholder in the prompt-fragments item, so this test supplies it here.
++      overrides: {
++        "steps/architect-plan":
++          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
++        "steps/architect-wave-report":
++          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
++      },
+     });
+   });
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
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/meta.yaml
new file mode 100644
index 0000000..84786dc
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 5
+name: develop
+attempt: 1
+fixRound: 2
+agent: developer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-08T21:48:11.409Z
+session: 01a1bd22-1ca2-75b2-a450-f7e64a301013
+endedAt: 2026-11-08T21:52:10.366Z
+usage:
+  inputTokens: 129824
+  outputTokens: 5631
+  costUsd: 0.016883
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T21-48-11-810Z_01a1bd22-1ca2-75b2-a450-f7e64a301013.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/output.yaml b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/output.yaml
new file mode 100644
index 0000000..833b04b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/hydration-fingerprint-caps/steps/005-develop-r2-a1/output.yaml
@@ -0,0 +1,21 @@
+status: ok
+summary: "Fix-round: gated legacy rename-merge detail overwrite on supplied
+  detail and removed dead yaml import"
+evidence:
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit exited 0
+  - cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/engine/hydration-fingerprint-caps.test.ts -> 15 pass, 0 fail, 89
+    expect() calls
+  - "bun repro: detail-less aggregate on legacy affects-keyed file migrates to
+    stable id, preserves rich stored detail, unions affects [new,old], removes
+    legacy file -> PASS=true"
+  - "bun repro: supplied-detail aggregate on legacy file still incoming-wins
+    (new detail) -> SUPPLIED_WINS_PASS=true"
+  - cd plugins/software-factory && TMPDIR=/tmp bun test (full suite) ->
+    backgrounded as bg_1, awaiting completion; target suite green
+concerns: []
+notes: 'Changed plugins/software-factory/src/core/concerns.ts only: line ~120
+  now `if (legacyFile && input.detail?.trim()) merged.detail =
+  input.detail.trim();` so mergeConcern longer-wins stands when detail omitted;
+  removed unused `import yaml from "yaml"` (only .yaml filename strings
+  remain).'
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index 5e2078d..8ec640d 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -1,7 +1,6 @@
 import fs from "node:fs";
 import path from "node:path";
 import { createHash } from "node:crypto";
-import yaml from "yaml";
 import type { Concern, ConcernCounts, ConcernSeverity, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
 import type { Repo } from "./git/repo.js";
 import { commitAll } from "./git/commit.js";
@@ -27,11 +26,12 @@ const affectsOf = (a?: string[]) => [...new Set((a ?? []).map((x) => x.trim()))]
 const hash = (prefix: string, parts: unknown[]) =>
   `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
 const rmId = (d: RemarkableDecision) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
-const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+const pick = (r: Obj) => JSON.stringify([r.detail ?? r.why ?? 0, r.severity ?? 0, r.chosen ?? 0, r.alternatives ?? 0, r.status, r.disposition ?? 0, r.affects ?? 0, r.pendingResolution ?? 0, r.source?.record, r.source?.agent, r.source?.step, r.source?.item, !!r.source?.escalated]);
+const locationOf = (l?: { file?: string; line?: number }) => [l?.file?.trim() ?? null, l?.line ?? null] as const;
 
-/** Stable concern identity: kind, normalized summary, location, sorted affects. */
+/** Stable concern identity: kind, normalized summary, location. */
 export function concernFingerprint(c: ConcernInput): string {
-  return hash("c", [c.kind, norm(c.summary), c.location?.file.trim() ?? null, c.location?.line ?? null, affectsOf(c.affects)]);
+  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
 }
 
 async function readExisting<T>(file: string): Promise<T | undefined> {
@@ -48,7 +48,9 @@ function mergeConcern(existing: StoredConcernArtifact | undefined, input: Concer
   const severity = existing && RANK[existing.severity] >= RANK[incomingSeverity] ? existing.severity : incomingSeverity;
   const escalated = Boolean(existing?.source?.escalated) || (existing !== undefined && RANK[incomingSeverity] > RANK[existing.severity]);
   const location = input.location ?? existing?.location;
-  const affects = input.affects ? affectsOf(input.affects) : existing?.affects;
+  const affects = input.affects
+    ? affectsOf([...(existing?.affects ?? []), ...input.affects])
+    : existing?.affects;
   return {
     ...(existing ?? {}), id: concernFingerprint(input), kind: existing?.kind ?? input.kind,
     summary: existing?.summary ?? input.summary.trim(), detail,
@@ -69,6 +71,28 @@ function mergeRemarkable(existing: Obj | undefined, input: RemarkableDecision, s
   };
 }
 
+/** Finds a pre-union fingerprint file for the same identity so it can be rename-merged. */
+async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file: string; record: StoredConcernArtifact } | undefined> {
+  let names: string[];
+  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+    if (err?.code === "ENOENT") return undefined;
+    throw err;
+  }
+  const [file, line] = locationOf(input.location);
+  for (const name of names.sort()) {
+    if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
+    const candidate = path.join(dir, name);
+    try {
+      const record = await readYaml<StoredConcernArtifact>(candidate);
+      if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
+      const [rfile, rline] = locationOf(record.location);
+      if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
+      return { file: candidate, record };
+    } catch { /* Corrupt entries are not migration candidates. */ }
+  }
+  return undefined;
+}
+
 /** Merges producer concerns and remarkable decisions, one taskWt file per fingerprint. */
 export async function aggregateConcerns(
   ctx: ConcernStoreContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables: RemarkableDecision[] = [], opts: { at?: string; commit?: boolean; dirty?: boolean } = {}
@@ -85,10 +109,17 @@ export async function aggregateConcerns(
     const out: StoredConcernArtifact[] = [];
     for (const input of concerns) {
       const file = path.join(dir, `${concernFingerprint(input)}.yaml`);
-      const existing = await readExisting<StoredConcernArtifact>(file);
+      let existing = await readExisting<StoredConcernArtifact>(file);
+      let legacyFile: string | undefined;
+      if (!existing) {
+        const migrated = await legacyConcern(dir, input);
+        if (migrated) { existing = migrated.record; legacyFile = migrated.file; }
+      }
       const merged = mergeConcern(existing, input, ctx.source, at);
-      if (existing && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
+      if (legacyFile && input.detail?.trim()) merged.detail = input.detail.trim();
+      if (existing && !legacyFile && pick(existing) === pick(merged) && (existing.source?.lastSeen ?? "") >= at) { out.push(existing); continue; }
       await writeYamlAtomic(file, merged);
+      if (legacyFile) await fs.promises.unlink(legacyFile);
       dirty = true; out.push(merged);
     }
     for (const decision of remarkables) {
@@ -168,27 +199,6 @@ export async function listConcernIds(taskDir: string): Promise<string[]> {
   }
 }
 
-/** Renders open concerns and remarkable decisions as prompt YAML (§18). */
-export async function hydrateConcernsYaml(taskDir: string): Promise<string> {
-  const dir = dirOf(taskDir);
-  let names: string[];
-  try { names = await fs.promises.readdir(dir); } catch (err: any) {
-    if (err?.code === "ENOENT") return "[]";
-    throw err;
-  }
-  const items = await Promise.all(
-    names
-      .filter((name) => (name.startsWith("c-") || name.startsWith("rm-")) && name.endsWith(".yaml"))
-      .map(async (name) => {
-        try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
-      })
-  );
-  const open = items
-    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string")
-    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)));
-  return open.length ? yaml.stringify(open).trimEnd() : "[]";
-}
-
 async function mutate(ctx: ConcernStoreContext, ops: Array<[string, Patch]>, message: string): Promise<StoredConcernArtifact[]> {
   const at = atOf(ctx), dir = dirOf(ctx.taskDir);
   const updated = await locks.runExclusive(ctx.taskDir, async () => {
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index 84a77f6..0cc7f10 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -30,12 +30,10 @@ import { appendJournal } from "../journal.js";
 import { loadCriteriaBundle, formatDispositionsSection } from "../prompts.js";
 import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
-  hydrateConcernsYaml,
   listConcernIds,
   listConcerns,
   partitionSuggestions,
 } from "../concerns.js";
-import { renderConcernsYaml } from "../triage.js";
 import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
 import { validateEdits } from "../plan/limits.js";
 import { applyEdits } from "../plan/apply.js";
@@ -169,23 +167,13 @@ async function buildArchitectHydration(
     }
   }
 
-  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
-  // every architect turn the terse decision context the act phase acts on.
-  // Appended last so the byte cap never evicts it.
-  const actionableConcerns = (await listConcerns(taskDir)).filter(
-    (c) => c.status === "open" || c.status === "routed"
-  );
-  if (actionableConcerns.length > 0) {
-    parts.push(
-      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
-    );
-  }
-
+  // Concerns are hydrated only through concernsYaml (adr-hydration-single-cap).
   const combined = parts.join("\n\n");
-  if (combined.length <= maxBytes) {
-    return combined;
-  }
-  return combined.slice(combined.length - maxBytes);
+  const buf = Buffer.from(combined, "utf8");
+  if (buf.length <= maxBytes) return combined;
+  let start = buf.length - maxBytes;
+  while (start < buf.length && (buf[start]! & 0b1100_0000) === 0b1000_0000) start++;
+  return buf.subarray(start).toString("utf8");
 }
 
 /**
@@ -524,7 +512,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
     // Triage ids are those that existed before this review round; capturing
     // them here mirrors the step-runner exact-id partition.
     const knownConcernIds = await listConcernIds(taskDir);
-    const concernsYaml = await hydrateConcernsYaml(taskDir);
     // Check if review round record already exists
     const revRecordName = `plan-review-${iteration}-${reviewRound}`;
     const revStepRes = await runAgentStep({
@@ -546,7 +533,6 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         plan: JSON.stringify(plan, null, 2),
         intent: intentText,
         context: contextYaml,
-        concernsYaml,
         limits: JSON.stringify(limits, null, 2),
         dispositionsCriteria: formatDispositionsSection(
           loadCriteriaBundle(pipeline.criteria).dispositions,
@@ -1025,6 +1011,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         waveReport: waveSummary,
         infra: infraYaml,
       },
+      parentBranch,
       turnsSemaphore,
       budgetTracker,
       iteration,
@@ -1252,6 +1239,7 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       plan: JSON.stringify(plan, null, 2),
       context: contextYaml,
     },
+    parentBranch,
     turnsSemaphore,
     budgetTracker,
     iteration,
diff --git a/plugins/software-factory/src/core/flows/step-runner.ts b/plugins/software-factory/src/core/flows/step-runner.ts
index 3b158c4..69fba68 100644
--- a/plugins/software-factory/src/core/flows/step-runner.ts
+++ b/plugins/software-factory/src/core/flows/step-runner.ts
@@ -27,14 +27,14 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   aggregateConcerns,
   applyCloseupResolutions,
-  listOpenConcerns,
 } from "../concerns.js";
 import {
   applyReviewTriage,
-  renderConcernsYaml,
+  hydrateStepConcerns,
   TriageValidationError,
   type ReviewTriageOutcome,
 } from "../triage.js";
+import { KNOWN_VARS } from "../prompt-vars.js";
 import { resolveStepRole, resolveRole, type ResolvedRole } from "../config/roles.js";
 import { captureHead, enforceHead } from "../git/guard.js";
 import { commitAll } from "../git/commit.js";
@@ -70,6 +70,8 @@ export interface StepRunOptions {
   project: ProjectConfig;
   prompts: any;
   promptVars: Record<string, string>;
+  parentBranch?: string;
+  gitFn?: typeof git;
   turnsSemaphore?: Semaphore;
   customSchema?: JSONSchema;
   log?: (msg: string) => void;
@@ -293,18 +295,35 @@ export async function runAgentStep(opts: StepRunOptions): Promise<StepRunResult>
   // 4. Render prompt and agent definition. Appends compact ## Output section (§6.4)
   const fragment = stepFragment ?? `steps/${stepId}`;
   const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
-  const openConcerns = await listOpenConcerns(taskDir);
-  const concernsYaml = openConcerns.length > 0
-    ? renderConcernsYaml(openConcerns, pipeline.limits?.hydrationBytes ?? 8000)
-    : "";
   const effectivePromptVars: Record<string, string> = {
     humanInvolvementCriteria: formatHumanInvolvementCriteria(
       criteriaBundle.humanInvolvement,
       pipeline.humanInvolvement
     ),
-    concernsYaml,
     ...promptVars,
   };
+  const knownVars = KNOWN_VARS[fragment] ?? KNOWN_VARS[fragment.replace(/^steps\//, "")] ?? [];
+  if (!Object.hasOwn(promptVars, "concernsYaml") && knownVars.includes("concernsYaml")) {
+    const stepRole = fragment.replace(/^steps\//, "");
+    if (stepRole === "review" || stepRole === "qa") {
+      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+        stepRole,
+        diffBytes: Buffer.byteLength(promptVars.diff ?? "", "utf8"),
+      });
+    } else if (stepRole.startsWith("wave-close-up") || stepRole.startsWith("plan-close-up")) {
+      const diff = await (opts.gitFn ?? git)(taskWt, ["diff", `${opts.parentBranch ?? `topic/${task}`}...HEAD`], { allowFail: true });
+      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, {
+        stepRole,
+        taskDiffBytes: diff.code === 0 ? Buffer.byteLength(diff.stdout, "utf8") : 0,
+      });
+    } else {
+      const excluded = new Set(["concernsYaml", "humanInvolvementCriteria", "debt", "steering"]);
+      const inputBytes = knownVars
+        .filter((key) => !excluded.has(key))
+        .reduce((total, key) => total + Buffer.byteLength(promptVars[key] ?? "", "utf8"), 0);
+      effectivePromptVars.concernsYaml = await hydrateStepConcerns(taskDir, { stepRole, inputBytes });
+    }
+  }
   let promptText: string;
   let agentDef: { body: string; tools: string[]; description: string };
   try {
diff --git a/plugins/software-factory/src/core/triage.ts b/plugins/software-factory/src/core/triage.ts
index 923a9d1..479287e 100644
--- a/plugins/software-factory/src/core/triage.ts
+++ b/plugins/software-factory/src/core/triage.ts
@@ -1,7 +1,10 @@
+import fs from "node:fs";
+import path from "node:path";
 import yaml from "yaml";
 import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
-import { applyConcernTriage } from "./concerns.js";
+import { applyConcernTriage, listConcerns } from "./concerns.js";
 import type { Repo } from "./git/repo.js";
+import { readYaml } from "./records/io.js";
 import { writeQuestion } from "./steer.js";
 
 /** Exact-id reviewer triage over review suggestions (§8.7, §18). */
@@ -65,25 +68,106 @@ function terseConcern(c: StoredConcernArtifact): Record<string, unknown> {
     severity: c.severity,
     summary: c.summary,
     ...(c.affects && c.affects.length > 0 ? { affects: c.affects } : {}),
+    ...(c.pendingResolution ? { pendingResolution: c.pendingResolution } : {}),
+    ...(c.status !== "open" ? { status: c.status } : {}),
+    ...(c.disposition ? { disposition: c.disposition } : {}),
+    ...(c.dismissReason ? { dismissReason: c.dismissReason } : {}),
+    ...(c.source?.escalated ? { escalated: true } : {}),
   };
 }
 
+export interface HydrateStepConcernsRequest {
+  stepRole: string;
+  inputBytes?: number;
+  diffBytes?: number;
+  taskDiffBytes?: number;
+  consumer?: string;
+}
+
 const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
 const serialize = (records: Array<Record<string, unknown>>) =>
   yaml.stringify(records, { lineWidth: 0 });
 const truncateChars = (text: string, max: number) =>
   Array.from(text).slice(0, max).join("");
 
+/** Normalizes step ids/fragments to their hydration role family. */
+function hydrationRole(stepRole: string): string {
+  const role = stepRole.replace(/^steps\//, "");
+  if (role === "architect" || role.startsWith("architect-")) return "architect";
+  if (role.startsWith("plan-review")) return "plan-review";
+  if (role.startsWith("plan-close-up")) return "plan-close-up";
+  if (role.startsWith("wave-close-up")) return "wave-close-up";
+  if (role === "review" || role === "qa") return role;
+  if (["develop", "test-first", "fix-round", "simple-implement", "integrate", "research", "poc", "test-assumptions"].includes(role)) return "develop";
+  return role;
+}
+
+function hydrationConsumer(role: string, consumer?: string): string {
+  if (consumer) return consumer;
+  if (role === "plan-review" || role === "develop" || role === "review" || role === "qa") return role;
+  if (role === "wave-close-up" || role === "plan-close-up") return "closeup";
+  return role === "architect" ? "architect" : role;
+}
+
+async function listOpenRemarkables(taskDir: string): Promise<Array<Record<string, unknown>>> {
+  const dir = path.join(taskDir, "concerns");
+  let names: string[];
+  try { names = await fs.promises.readdir(dir); } catch (err: any) {
+    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
+    throw err;
+  }
+  const records = await Promise.all(
+    names.filter((name) => name.startsWith("rm-") && name.endsWith(".yaml")).map(async (name) => {
+      try { return await readYaml<Record<string, any>>(path.join(dir, name)); } catch { return undefined; }
+    })
+  );
+  return records
+    .filter((r): r is Record<string, any> => r?.status === "open" && typeof r.id === "string" && typeof r.chosen === "string")
+    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || String(a.id).localeCompare(String(b.id)))
+    .map((r) => ({ id: r.id, kind: "remarkable", summary: r.chosen }));
+}
+
+/** Hydrated concern set per consumer (adr-hydrated-sets). */
+export async function listHydratedConcerns(
+  taskDir: string,
+  consumer: string
+): Promise<Array<Record<string, unknown>>> {
+  const includeRouted = consumer === "closeup" || consumer === "architect";
+  const includeEscalated = consumer === "architect";
+  const concerns = (await listConcerns(taskDir)).filter((c) =>
+    c.status === "open" ||
+    (includeRouted && c.status === "routed") ||
+    (includeEscalated && c.status === "dismissed" && Boolean(c.source?.escalated))
+  );
+  return [...concerns.map(terseConcern), ...(await listOpenRemarkables(taskDir))];
+}
+
+/** Caps hydration for a step role: review/qa by diff, close-ups by task diff, planning by prompt input. */
+export async function hydrateStepConcerns(
+  taskDir: string,
+  request: HydrateStepConcernsRequest
+): Promise<string> {
+  const role = hydrationRole(request.stepRole);
+  const cap = role === "review" || role === "qa"
+    ? Math.min(request.diffBytes ?? 0, 2000)
+    : role === "wave-close-up" || role === "plan-close-up"
+      ? Math.min(request.taskDiffBytes ?? 0, 2000)
+      : Math.min(request.inputBytes ?? 0, 500);
+  if (cap <= 0) return "";
+  const records = await listHydratedConcerns(taskDir, hydrationConsumer(role, request.consumer));
+  return records.length > 0 ? renderConcernsYaml(records, cap) : "";
+}
+
 /**
- * Renders open concerns as terse, byte-capped YAML for prompt hydration.
- * Detail is dropped; over-budget output condenses summaries, drops affects,
- * then sheds trailing entries until the UTF-8 byte ceiling is met.
+ * Renders terse concern records as byte-capped prompt YAML. Over-budget output
+ * condenses summaries, drops affects, then sheds trailing entries; empty output
+ * is returned when no record fits the ceiling.
  */
 export function renderConcernsYaml(
-  concerns: StoredConcernArtifact[],
+  records: Array<Record<string, unknown>>,
   maxBytes = 8000
 ): string {
-  const records = concerns.map(terseConcern);
+  if (maxBytes <= 0 || records.length === 0) return "";
   const variants: Array<{ records: Array<Record<string, unknown>>; summaryLimit?: number }> = [
     { records },
     { records: records.map(({ affects: _affects, ...rest }) => rest) },
@@ -110,7 +194,7 @@ export function renderConcernsYaml(
       if (utf8Bytes(text) <= maxBytes) return text;
     }
   }
-  return serialize([]);
+  return "";
 }
 
 /**
diff --git a/plugins/software-factory/test/engine/concerns-funnel.test.ts b/plugins/software-factory/test/engine/concerns-funnel.test.ts
index a1f0728..ff3f5e8 100644
--- a/plugins/software-factory/test/engine/concerns-funnel.test.ts
+++ b/plugins/software-factory/test/engine/concerns-funnel.test.ts
@@ -317,7 +317,7 @@ describe("Concern store", () => {
     });
   }
 
-  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
+  it("fingerprints concern identity, ignoring detail, severity, and affects", () => {
     const identity = {
       kind: "risk" as const,
       summary: "  Flaky   GATE ",
@@ -339,7 +339,9 @@ describe("Concern store", () => {
     expect(
       concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
     ).not.toBe(fp);
-    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
+    // Affects are merged as a union, not part of the identity (adr-fingerprint-affects-union).
+    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(fp);
+    expect(concernFingerprint({ ...identity, affects: [] })).toBe(fp);
   });
 
   it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
diff --git a/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
new file mode 100644
index 0000000..d75dcb9
--- /dev/null
+++ b/plugins/software-factory/test/engine/hydration-fingerprint-caps.test.ts
@@ -0,0 +1,839 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import os from "node:os";
+import { createHash } from "node:crypto";
+import yaml from "yaml";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runAgentStep } from "../../src/core/flows/step-runner.js";
+import { runIteration } from "../../src/core/flows/iteration.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
+import {
+  aggregateConcerns,
+  applyConcernTriage,
+  concernFingerprint,
+  countConcerns,
+  listConcerns,
+} from "../../src/core/concerns.js";
+import * as triageModule from "../../src/core/triage.js";
+import type {
+  ConcernSource,
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
+ * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
+ *
+ * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
+ * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
+ * plan-review/architect/develop-family from their registered prompt input.
+ */
+
+const ORCH = ".factory";
+const TASK = "hydration-caps";
+const agentsDir = path.resolve(import.meta.dir, "../../agents");
+
+type Hydrate = (
+  taskDir: string,
+  request: {
+    stepRole: string;
+    inputBytes?: number;
+    diffBytes?: number;
+    taskDiffBytes?: number;
+    consumer?: string;
+  }
+) => Promise<string>;
+type ListHydrated = (
+  taskDir: string,
+  consumer: string
+) => Promise<Array<Record<string, any>>>;
+
+/**
+ * New triage exports are looked up dynamically so this file collects against the
+ * pre-implementation module and fails on behavior, not on a missing import.
+ */
+function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
+  const mod = triageModule as unknown as {
+    hydrateStepConcerns?: Hydrate;
+    listHydratedConcerns?: ListHydrated;
+  };
+  const hydrate = mod.hydrateStepConcerns;
+  const list = mod.listHydratedConcerns;
+  if (!hydrate || !list) {
+    return {
+      hydrate: (() => {
+        throw new Error("hydrateStepConcerns is not implemented");
+      }) as unknown as Hydrate,
+      list: (() => {
+        throw new Error("listHydratedConcerns is not implemented");
+      }) as unknown as ListHydrated,
+    };
+  }
+  return { hydrate, list };
+}
+
+const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
+const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
+const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
+
+describe("Hydration caps (adr-hydration-single-cap)", () => {
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
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
+    tmpRepo.commit("add hydration caps task");
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
+        reviewer: { role: "alt-workhorse" },
+        qa: { role: "alt-workhorse" },
+        architect: { role: "architect" },
+        "plan-reviewer": { role: "alt-architect" },
+        pm: { role: "alt-workhorse" },
+        "wave-close-up": { role: "alt-workhorse" },
+        "plan-close-up": { role: "alt-workhorse" },
+      },
+      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
+      limits: { maxPlanReviewRounds: 1 },
+    };
+    project = { orchestrationFolder: ORCH, worktreeRoot };
+    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function concern(
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
+  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+  }
+
+  function concernsDir() {
+    return path.join(taskDir, "concerns");
+  }
+
+  function concernFiles(prefix = "c-") {
+    const dir = concernsDir();
+    if (!fs.existsSync(dir)) return [];
+    return fs
+      .readdirSync(dir)
+      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
+      .map((name) => name.slice(0, -".yaml".length))
+      .sort();
+  }
+
+  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
+    const harness = new FakeHarness();
+    const label = `${TASK}/runs/review#a1`;
+    harness.scriptOutcome(label, {
+      ok: true,
+      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+    });
+    harness.scriptOutcome(`${label}#relaunch`, {
+      ok: true,
+      data: { status: "approved", summary: "Looks fine", suggestions: [] },
+    });
+    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
+    return runAgentStep({
+      task: TASK,
+      stepId: "review",
+      stepFragment: "steps/review",
+      agent: "reviewer",
+      cwd: taskWt,
+      taskWt,
+      taskDir,
+      recordsDir: path.join(taskDir, "runs"),
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts: promptsFor,
+      promptVars,
+    }).then((result) => ({ result, harness }));
+  }
+
+  function promptOf(harness: FakeHarness): string {
+    const call = harness.calls.find((c) => c.type === "run");
+    if (!call || call.type !== "run") throw new Error("no agent run captured");
+    return call.run.prompt;
+  }
+
+  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
+    await writeConcern({
+      id: "c-aaaaaaaaaa",
+      kind: "risk",
+      summary: "Retry loop can spin",
+      detail: "DETAIL_SENTINEL" + "d".repeat(600),
+      severity: "high",
+      affects: ["item-a"],
+    });
+    await writeConcern({
+      id: "c-bbbbbbbbbb",
+      kind: "blocker",
+      summary: "Missing adapter",
+      detail: "e".repeat(600),
+      severity: "medium",
+    });
+
+    const { hydrate } = hydrationApi();
+    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+    expect(hydrated).toContain("c-aaaaaaaaaa");
+    expect(hydrated).toContain("Retry loop can spin");
+    expect(hydrated).not.toContain("DETAIL_SENTINEL");
+    expect(yaml.parse(hydrated)).toHaveLength(2);
+
+    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
+    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
+    expect(small).toContain("c-");
+  });
+
+  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
+    await writeConcern({
+      id: "c-cccccccccc",
+      kind: "tech-debt",
+      summary: "Plan duplicates the retry helper",
+      detail: "f".repeat(600),
+      severity: "medium",
+      affects: ["m1"],
+    });
+    await writeConcern({
+      id: "c-dddddddddd",
+      kind: "risk",
+      summary: "Milestone boundary depends on an unbuilt adapter",
+      detail: "g".repeat(600),
+      severity: "high",
+      affects: ["m1"],
+    });
+
+    const { hydrate } = hydrationApi();
+    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
+    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
+    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
+    expect(hydrated).toContain("c-cccccccccc");
+
+    // Iteration 2+ has merged code on the branch: classification still uses the
+    // registered prompt input, not a branch-state diff inference.
+    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
+    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
+  });
+
+  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
+    await writeConcern({
+      id: "c-eeeeeeeeee",
+      kind: "tech-debt",
+      summary: "Shared helper duplicated in two modules",
+      detail: "h".repeat(3000),
+      severity: "medium",
+    });
+    await writeConcern({
+      id: "c-ffffffffff",
+      kind: "assumption",
+      summary: "Cache survives restart",
+      detail: "i".repeat(3000),
+      severity: "low",
+    });
+
+    const { hydrate } = hydrationApi();
+    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
+    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
+    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
+    expect(hydrated).toContain("c-eeeeeeeeee");
+
+    const planCloseup = await hydrate(taskDir, {
+      stepRole: "plan-close-up",
+      taskDiffBytes: 5000,
+    });
+    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
+  });
+
+  it("returns empty hydration for zero and tiny caps", async () => {
+    await writeConcern({
+      id: "c-1111111111",
+      kind: "risk",
+      summary: "Visible only when the cap allows bytes",
+      detail: "j".repeat(600),
+    });
+
+    const { hydrate } = hydrationApi();
+    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
+    expect(positive).not.toBe("");
+    expect(idLines(positive).length).toBeGreaterThan(0);
+
+    for (const cap of [0, 1, 3]) {
+      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
+      expect(empty).toBe("");
+      expect(idLines(empty)).toEqual([]);
+    }
+  });
+
+  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
+    const summary = "Retry loop can spin";
+    const cid = "c-2222222222";
+    await writeConcern({
+      id: cid,
+      kind: "risk",
+      summary,
+      detail: "DETAIL_SENTINEL" + "k".repeat(400),
+      severity: "high",
+      affects: ["item-a"],
+    });
+
+    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
+    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
+    expect(promptOf(zero.harness)).not.toContain(cid);
+
+    const hydrated = await runReview({
+      assignment: "Review",
+      checks: "",
+      diff: "d".repeat(3000),
+      dispositionsCriteria: "",
+    });
+    const prompt = promptOf(hydrated.harness);
+    expect(prompt).toContain(cid);
+    expect(prompt).toContain(summary);
+    expect(prompt).not.toContain("DETAIL_SENTINEL");
+
+    const supplied = await runReview({
+      assignment: "Review",
+      checks: "",
+      diff: "d".repeat(3000),
+      dispositionsCriteria: "",
+      concernsYaml: "CALLER-CONCERNS: c-caller",
+    });
+    const suppliedPrompt = promptOf(supplied.harness);
+    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
+    expect(suppliedPrompt).not.toContain(cid);
+  });
+
+  it("computes close-up task diff bytes through the injected git function", async () => {
+    const cid = "c-3333333333";
+    await writeConcern({
+      id: cid,
+      kind: "risk",
+      summary: "Close-up concern",
+      detail: "l".repeat(400),
+      severity: "medium",
+    });
+
+    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
+    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+    fs.writeFileSync(
+      path.join(overridesDir, "steps", "wave-close-up.md"),
+      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
+      "utf8"
+    );
+    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });
+
+    const gitCalls: string[][] = [];
+    const gitFn = async (_cwd: string, args: string[]) => {
+      gitCalls.push(args);
+      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
+    };
+    const harness = new FakeHarness();
+    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+    });
+    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
+    });
+    try {
+      await runAgentStep({
+        task: TASK,
+        stepId: "wave-close-up-1-1",
+        stepFragment: "steps/wave-close-up",
+        agent: "wave-close-up",
+        cwd: taskWt,
+        taskWt,
+        taskDir,
+        parentBranch: "topic/demo",
+        recordsDir: path.join(taskDir, "runs"),
+        repo,
+        harness,
+        pipeline,
+        project,
+        prompts: closeupPrompts,
+        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
+        gitFn,
+      } as any);
+    } finally {
+      fs.rmSync(overridesDir, { recursive: true, force: true });
+    }
+
+    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
+    const prompt = promptOf(harness);
+    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
+    expect(block).toContain(cid);
+    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
+    expect(utf8Bytes(block)).toBeLessThan(5000);
+  });
+
+  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
+    const cid = "c-4444444444";
+    await writeConcern({
+      id: cid,
+      kind: "blocker",
+      summary: "Database schema migration is pending",
+      detail: "m".repeat(400),
+      severity: "high",
+      status: "routed",
+      disposition: "architect",
+      affects: ["seed"],
+    });
+    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
+      id: "dec-1",
+      context: "task",
+      decision: "continue",
+      rationale: "漢".repeat(120),
+      timestamp: "2026-01-01T00:00:00.000Z",
+    });
+
+    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
+    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
+    fs.writeFileSync(
+      path.join(overridesDir, "steps", "architect-plan.md"),
+      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
+      "utf8"
+    );
+    const architectPrompts = loadPromptLibrary({
+      builtinDir: agentsDir,
+      overrideDirs: [overridesDir],
+    });
+
+    const harness = new FakeHarness();
+    let architectPrompt = "";
+    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
+      architectPrompt = run.prompt;
+      return {
+        ok: true,
+        data: {
+          iteration: 1,
+          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
+          itemOutlines: [],
+        },
+      };
+    });
+    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Plan ok", suggestions: [] },
+    });
+    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: { iteration: 1, items: [] },
+    });
+
+    try {
+      await runIteration({
+        task: TASK,
+        taskDir,
+        taskWt,
+        repo,
+        harness,
+        pipeline: {
+          ...pipeline,
+          limits: {
+            hydrationBytes: 20,
+            maxPlanReviewRounds: 1,
+            maxIterations: 3,
+            maxParallelItems: 2,
+            maxParallelTurns: 4,
+            maxStepAttempts: 3,
+            maxFixRounds: 3,
+          },
+        },
+        project,
+        prompts: architectPrompts,
+      });
+    } finally {
+      fs.rmSync(overridesDir, { recursive: true, force: true });
+    }
+
+    expect(architectPrompt).toContain(cid);
+    expect(occurrences(architectPrompt, cid)).toBe(1);
+    expect(architectPrompt).not.toContain("--- Concerns ---");
+
+    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
+    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
+    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
+    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
+    expect(debt).not.toContain("\uFFFD");
+    expect(steering).not.toContain("\uFFFD");
+
+    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
+    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
+    expect(concerns).toContain(cid);
+  });
+});
+
+describe("Hydrated concern sets (adr-hydrated-sets)", () => {
+  let tmpRepo: TmpRepo;
+  let taskDir: string;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
+    fs.mkdirSync(taskDir, { recursive: true });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function concern(
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
+  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
+    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
+  }
+
+  async function writeRemarkable(
+    id: string,
+    chosen: string,
+    overrides: Record<string, unknown> = {}
+  ) {
+    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
+      id,
+      chosen,
+      alternatives: ["Other"],
+      why: "w".repeat(300),
+      status: "open",
+      source: { record: "001-architect-plan-a1", agent: "architect" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+      ...overrides,
+    });
+  }
+
+  it("hydrates open concerns with pending resolutions for review", async () => {
+    const pending = {
+      action: "carry" as const,
+      note: "Needs an architect decision",
+      by: "wave-close-up",
+      at: "2026-01-02T00:00:00.000Z",
+    };
+    await writeConcern({
+      id: "c-5555555555",
+      summary: "Needs a decision",
+      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
+      pendingResolution: pending,
+    });
+
+    const { list } = hydrationApi();
+    for (const consumer of ["review", "develop", "qa"]) {
+      const hydrated = await list(taskDir, consumer);
+      expect(hydrated).toHaveLength(1);
+      expect(hydrated[0]).toMatchObject({
+        id: "c-5555555555",
+        kind: "risk",
+        summary: "Needs a decision",
+        pendingResolution: pending,
+      });
+      expect(hydrated[0]).not.toHaveProperty("detail");
+    }
+  });
+
+  it("includes routed concerns for close-ups but not for review", async () => {
+    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
+    await writeConcern({
+      id: "c-7777777777",
+      status: "routed",
+      disposition: "architect",
+      createdAt: "2026-01-02T00:00:00.000Z",
+    });
+    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });
+
+    const { list } = hydrationApi();
+    const review = await list(taskDir, "review");
+    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);
+
+    const closeup = await list(taskDir, "closeup");
+    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
+  });
+
+  it("hydrates open remarkables as terse remarkable records", async () => {
+    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
+    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });
+
+    const { list } = hydrationApi();
+    const review = await list(taskDir, "review");
+    expect(review).toEqual([
+      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+    ]);
+
+    const architect = await list(taskDir, "architect");
+    expect(architect).toEqual([
+      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
+    ]);
+  });
+
+  it("includes dismissed escalated concerns only in the architect set", async () => {
+    await writeConcern({
+      id: "c-9999999999",
+      status: "dismissed",
+      dismissReason: "not real",
+      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
+      createdAt: "2026-01-01T00:00:00.000Z",
+    });
+    await writeConcern({
+      id: "c-ababababab",
+      status: "dismissed",
+      dismissReason: "quiet",
+      createdAt: "2026-01-02T00:00:00.000Z",
+    });
+    await writeConcern({
+      id: "c-acacacacac",
+      status: "open",
+      createdAt: "2026-01-03T00:00:00.000Z",
+    });
+
+    const { list } = hydrationApi();
+    const review = await list(taskDir, "review");
+    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);
+
+    const architect = await list(taskDir, "architect");
+    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
+    expect(architect[0]).toMatchObject({
+      id: "c-9999999999",
+      status: "dismissed",
+      escalated: true,
+    });
+  });
+
+  it("counts concerns only, never remarkables", async () => {
+    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
+    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });
+
+    await writeConcern({ id: "c-adadadadad", status: "open" });
+    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
+  });
+});
+
+describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
+  let tmpRepo: TmpRepo;
+  let repo: Repo;
+  let taskWt: string;
+  let taskDir: string;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
+    taskWt = tmpRepo.dir;
+    taskDir = path.join(taskWt, ORCH, TASK);
+    fs.mkdirSync(taskDir, { recursive: true });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  function source(record = "001-develop-a1"): ConcernSource {
+    return { record, agent: "developer" };
+  }
+
+  function concernFiles() {
+    const dir = path.join(taskDir, "concerns");
+    if (!fs.existsSync(dir)) return [];
+    return fs
+      .readdirSync(dir)
+      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
+      .map((name) => name.slice(0, -".yaml".length))
+      .sort();
+  }
+
+  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
+  function legacyFingerprint(input: {
+    kind: string;
+    summary: string;
+    location?: { file: string; line?: number };
+    affects?: string[];
+  }): string {
+    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
+    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
+    const parts = [
+      input.kind,
+      norm(input.summary),
+      input.location?.file.trim() ?? null,
+      input.location?.line ?? null,
+      affects,
+    ];
+    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
+  }
+
+  it("fingerprints kind, normalized summary, and location without affects", () => {
+    const identity = {
+      kind: "risk" as const,
+      summary: "  Flaky   GATE ",
+      location: { file: "src/core/example.ts", line: 7 },
+    };
+    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });
+
+    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
+    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
+    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
+    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);
+
+    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
+    expect(
+      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
+    ).not.toBe(id);
+  });
+
+  it("unions affects without forking and preserves terminal status", async () => {
+    const identity = {
+      kind: "risk" as const,
+      summary: "Flaky gate blocks merges",
+      location: { file: "src/core/merge.ts", line: 12 },
+    };
+    const id = concernFingerprint(identity);
+
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, source: source() },
+      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
+    );
+    expect(concernFiles()).toEqual([id]);
+
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
+    );
+    expect(concernFiles()).toEqual([id]);
+    let stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${id}.yaml`)
+    );
+    expect(stored.affects).toEqual(["item-a", "item-b"]);
+    expect(stored.status).toBe("open");
+    expect(stored.detail).toBe("a much longer detail");
+    expect(stored.severity).toBe("high");
+    expect(stored.source.escalated).toBe(true);
+
+    await applyConcernTriage({
+      taskDir,
+      taskWt,
+      repo,
+      isTriager: true,
+      suggestions: [
+        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
+      ],
+    });
+
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, source: source("003-review-a1") },
+      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
+    );
+    expect(concernFiles()).toEqual([id]);
+    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
+    expect(stored.status).toBe("dismissed");
+    expect(stored.dismissReason).toBe("covered by ADR-1");
+    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
+    expect(stored.source.escalated).toBe(true);
+  });
+
+  it("renames a legacy affects-keyed file to the stable id", async () => {
+    const identity = {
+      kind: "risk" as const,
+      summary: "Legacy concern",
+      location: { file: "src/legacy.ts", line: 4 },
+    };
+    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
+    const stableId = concernFingerprint(identity);
+    expect(legacyId).not.toBe(stableId);
+
+    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
+      id: legacyId,
+      ...identity,
+      detail: "legacy detail",
+      severity: "medium",
+      status: "open",
+      affects: ["old"],
+      source: { record: "000-develop-a1", agent: "developer" },
+      createdAt: "2026-01-01T00:00:00.000Z",
+      updatedAt: "2026-01-01T00:00:00.000Z",
+    });
+    expect(concernFiles()).toEqual([legacyId]);
+
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, source: source("001-develop-a1") },
+      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
+    );
+
+    expect(concernFiles()).toEqual([stableId]);
+    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
+    const stored = await readYaml<StoredConcernArtifact>(
+      path.join(taskDir, "concerns", `${stableId}.yaml`)
+    );
+    expect(stored.id).toBe(stableId);
+    expect(stored.affects).toEqual(["new", "old"]);
+    expect(stored.detail).toBe("new detail");
+    expect(stored.severity).toBe("high");
+
+    // Re-emitting with another affect keeps the same stable triage id.
+    await aggregateConcerns(
+      { taskDir, taskWt, repo, source: source("002-develop-a1") },
+      [{ ...identity, affects: ["new", "third"] }]
+    );
+    expect(concernFiles()).toEqual([stableId]);
+    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
+  });
+});
diff --git a/plugins/software-factory/test/engine/reviewer-triage.test.ts b/plugins/software-factory/test/engine/reviewer-triage.test.ts
index fb7cc9b..df5eac8 100644
--- a/plugins/software-factory/test/engine/reviewer-triage.test.ts
+++ b/plugins/software-factory/test/engine/reviewer-triage.test.ts
@@ -16,9 +16,9 @@ import {
   concernMailboxId,
   isDebtConcern,
   partitionReviewSuggestions,
-  renderConcernsYaml,
   type ReviewTriageOutcome,
 } from "../../src/core/triage.js";
+import * as triageModule from "../../src/core/triage.js";
 import type {
   PipelineConfig,
   ProjectConfig,
@@ -156,7 +156,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
         assignment: "Review the item",
         checks: "",
         testDiff: "",
-        diff: "",
+        diff: "d".repeat(3000),
         dispositionsCriteria: "",
       },
     });
@@ -227,7 +227,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
     expect(qa.fixRequired).toBe(false);
   });
 
-  it("renders condensing concern YAML without detail and within the byte cap", () => {
+  it("renders condensed concern YAML without detail and within the byte cap", async () => {
     const concerns = [
       storedConcern({
         id: "c-aaaaaaaaaa",
@@ -245,8 +245,19 @@ describe("Reviewer triage (§8.7, §18)", () => {
         detail: "e".repeat(600),
       }),
     ];
-
-    const rendered = renderConcernsYaml(concerns);
+    for (const concern of concerns) await writeConcern(concern);
+
+    const hydrate = (
+      triageModule as unknown as {
+        hydrateStepConcerns?: (
+          taskDir: string,
+          request: { stepRole: string; diffBytes: number }
+        ) => Promise<string>;
+      }
+    ).hydrateStepConcerns;
+    if (!hydrate) throw new Error("hydrateStepConcerns is not implemented");
+
+    const rendered = await hydrate(taskDir, { stepRole: "review", diffBytes: 8000 });
     const parsed = yaml.parse(rendered);
     expect(Array.isArray(parsed)).toBe(true);
     expect(parsed).toHaveLength(2);
@@ -268,7 +279,7 @@ describe("Reviewer triage (§8.7, §18)", () => {
       Buffer.byteLength(JSON.stringify(concerns), "utf8")
     );
 
-    const capped = renderConcernsYaml(concerns, 120);
+    const capped = await hydrate(taskDir, { stepRole: "review", diffBytes: 120 });
     expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
     expect(capped).not.toContain("\uFFFD");
   });
diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
index 3eb7799..58961a9 100644
--- a/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
@@ -137,6 +137,14 @@ describe("Routing: architect consult and hydration", () => {
     prompts = loadPromptLibrary({
       builtinDir: path.resolve(import.meta.dir, "../../agents"),
       overrideDirs: [],
+      // The single hydration source is concernsYaml; prompt fragments gain the
+      // placeholder in the prompt-fragments item, so this test supplies it here.
+      overrides: {
+        "steps/architect-plan":
+          "Architect plan\nDEBT:\n{{debt}}\nSTEERING:\n{{steering}}\nCONCERNS:\n{{concernsYaml}}\n",
+        "steps/architect-wave-report":
+          "Architect wave report\nCONCERNS:\n{{concernsYaml}}\n",
+      },
     });
   });

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
