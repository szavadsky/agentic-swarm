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
  "slug": "schema-detail-normalize-v4",
  "kind": "dev",
  "title": "Lowercase detail in producer schemas + merge fix (final retry)",
  "assignment": "FINAL RETRY (closes QA-exhausted v3 per decision 026). Baseline is RED. Normalize concern Detail (capital-D) to detail (lowercase-d) in 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (~:33) AND newConcerns[].Detail (~:65) to match generated review-schema.ts which already emits lowercase-d for both. TS fix at plugins/software-factory/src/core/concerns.ts:74: change guard's existing?.Detail capital-D read to lowercase-d detail read, restoring longest-wins and StoredConcernArtifact typing. Fix ALL positive stored reads to lowercase-d via :raw verification (never rely on grep alone): plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 and plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep funnel-text-budget.test.ts + any other :raw Detail reads. PRESERVE capital-D in all negative-casing fixtures: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip; rejection/absence/expect-error stay capital-D. Do NOT add duplicate longest-wins tests (they exist). Add suggestions-casing assertion to reference-review-schema contract test: suggestions[].properties.detail exists lowercase-d AND suggestions[].properties.Detail absent. Do NOT touch triage/infra/pm-edit. Interfaces: step-runner validation -> runtime schemas (lowercase accepted, capital rejected pre-write); aggregateConcerns/mergeConcern carry lowercase longest-wins; contract suites assert schemas + StoredConcernArtifact. Verify: tsc --noEmit clean, TMPDIR=/tmp bun test contracts + longest-wins + epic-saga green, then TMPDIR=/tmp full suite green.",
  "outlineRef": "schema-detail-normalize-v4",
  "milestone": "m0-detail-normalize",
  "wave": 1,
  "scenarioRefs": [
    "m0-detail-normalize:1",
    "m0-detail-normalize:2",
    "m0-detail-normalize:3",
    "m0-detail-normalize:4"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..682a0bd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,36 @@
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
+    message: "target-red passed: all 2 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/contracts/schema-detail-normalize.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794230432152-mg8gsxbtb9n.xml
+      junitCaseCount: 7
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
+        - legacy capital-D stored concerns normalize to lowercase detail.lists a
+          legacy capital-D detail as lowercase detail without the legacy key
+        - legacy capital-D stored concerns normalize to lowercase detail.keeps
+          the legacy capital-D stored detail when a shorter lowercase detail is
+          re-emitted
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..a1ee48d
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,64 @@
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
+  "slug": "schema-detail-normalize-v4",
+  "kind": "dev",
+  "title": "Lowercase detail in producer schemas + merge fix (final retry)",
+  "assignment": "FINAL RETRY (closes QA-exhausted v3 per decision 026). Baseline is RED. Normalize concern Detail (capital-D) to detail (lowercase-d) in 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (~:33) AND newConcerns[].Detail (~:65) to match generated review-schema.ts which already emits lowercase-d for both. TS fix at plugins/software-factory/src/core/concerns.ts:74: change guard's existing?.Detail capital-D read to lowercase-d detail read, restoring longest-wins and StoredConcernArtifact typing. Fix ALL positive stored reads to lowercase-d via :raw verification (never rely on grep alone): plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 and plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep funnel-text-budget.test.ts + any other :raw Detail reads. PRESERVE capital-D in all negative-casing fixtures: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip; rejection/absence/expect-error stay capital-D. Do NOT add duplicate longest-wins tests (they exist). Add suggestions-casing assertion to reference-review-schema contract test: suggestions[].properties.detail exists lowercase-d AND suggestions[].properties.Detail absent. Do NOT touch triage/infra/pm-edit. Interfaces: step-runner validation -> runtime schemas (lowercase accepted, capital rejected pre-write); aggregateConcerns/mergeConcern carry lowercase longest-wins; contract suites assert schemas + StoredConcernArtifact. Verify: tsc --noEmit clean, TMPDIR=/tmp bun test contracts + longest-wins + epic-saga green, then TMPDIR=/tmp full suite green.",
+  "outlineRef": "schema-detail-normalize-v4",
+  "milestone": "m0-detail-normalize",
+  "wave": 1,
+  "scenarioRefs": [
+    "m0-detail-normalize:1",
+    "m0-detail-normalize:2",
+    "m0-detail-normalize:3",
+    "m0-detail-normalize:4"
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
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..10d8354
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T13:04:01.129Z
+session: 01a1c068-9580-7042-ad52-7769ccabddb6
+endedAt: 2026-11-09T13:20:32.996Z
+usage:
+  inputTokens: 162156
+  outputTokens: 74167
+  costUsd: 0.097955
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T13-04-01-920Z_01a1c068-9580-7042-ad52-7769ccabddb6.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..f025149
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,88 @@
+status: ok
+summary: "Authored test-first coverage for the lowercase concern-detail contract
+  in plugins/software-factory/test/contracts/schema-detail-normalize.test.ts.
+  Added the missing reference-review-schema suggestions casing assertions
+  (suggestions[].properties.detail lowercase, Detail absent,
+  additionalProperties:false; lowercase suggestion accepted, capital-D
+  rejected). Audit showed the runtime schemas, generated review schema, and
+  concerns.ts merge guard are already lowercase in this baseline, so the only
+  executable red gap is legacy capital-D (`Detail`) stored-record normalization:
+  two new tests assert (a) listConcerns surfaces a legacy capital-D record as
+  lowercase `detail` without the legacy key, and (b)
+  aggregateConcerns/mergeConcern keeps the longer legacy stored detail and
+  rewrites it as lowercase. Both fail now with pure assertion failures, and the
+  rest of the suite remains green."
+target:
+  selectors:
+    - test/contracts/schema-detail-normalize.test.ts
+  expectRed:
+    - legacy capital-D stored concerns normalize to lowercase detail.lists a
+      legacy capital-D detail as lowercase detail without the legacy key
+    - legacy capital-D stored concerns normalize to lowercase detail.keeps the
+      legacy capital-D stored detail when a shorter lowercase detail is
+      re-emitted
+evidence:
+  - "Raw-audited all 7 schema files:
+    decisions/developer-output/fact-finder-output/plan/plan-closeup/wave-closeup
+    concern items and review.schema.json suggestions (:33) + newConcerns (:65)
+    already declare lowercase detail; no capital-D key remains in any schema."
+  - "Raw-audited concerns.ts:74: guard reads existing?.detail (lowercase) and
+    compares UTF-8 bytes; positive stored reads in
+    epic-saga-propagate.test.ts:248/307/313/319,
+    schema-detail-normalize.test.ts:234/263 and funnel-text-budget.test.ts are
+    already lowercase."
+  - "Verified capital-D is preserved only in negative fixtures via awk line
+    listing: schema-detail-normalize absence/rejection payloads,
+    concern-schemas.test.ts:450/540/624/693 rejection payloads,
+    concern-artifact-types.test.ts:417 ts-expect-error fixture."
+  - Added suggestions-casing assertions to the reference-only review schema
+    test; bun test test/contracts/schema-detail-normalize.test.ts -> new
+    reference-review test passes (5 pass total alongside the 2 intended reds).
+  - "Red proof: bun test test/contracts/schema-detail-normalize.test.ts -> 5
+    pass, 2 fail; failures are expect(received).toBe(expected) assertion
+    failures (undefined != 200-byte legacy detail; 20-byte re-emit != 200-byte
+    legacy detail), no errors."
+  - "JUnit proof of runner wiring: bun test
+    test/contracts/schema-detail-normalize.test.ts --reporter=junit
+    --reporter-outfile=/tmp/junit-detail-red.xml -> 2 <failure>, 0 <error>;
+    parseJunit reports collected:true and both declared expectRed ids match with
+    status=fail."
+  - "typecheck: cd plugins/software-factory && bun run typecheck -> clean (tsc
+    --noEmit)."
+  - "Focused suites: TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts
+    test/engine/epic-saga-propagate.test.ts
+    test/engine/funnel-text-budget.test.ts -> 23 pass, 2 fail (only the declared
+    legacy tests)."
+  - "Contracts suite: TMPDIR=/tmp bun test test/contracts -> 22 pass, 2 fail
+    (only the declared legacy tests)."
+  - "Full suite: TMPDIR=/tmp bun test -> 467 pass, 2 skip, 2 fail across 471
+    tests; the only failures are the two declared red tests (baseline was 467
+    pass, 2 skip, 0 fail across 469)."
+  - "Scope: git status shows only
+    plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
+    modified; no production files changed."
+concerns:
+  - "Assigned 'baseline is RED' premise does not match this worktree: all
+    runtime schemas, the reference review schema, generated review-schema.ts,
+    concerns.ts:74 and all positive stored reads are already lowercase, and
+    capital-D never existed in schema files in git history. Existing
+    lowercase/longest-wins behavior is fully green before this step."
+  - "Because the claimed production gap is absent, the only honest red-to-green
+    work remaining is legacy stored-record normalization: develop must normalize
+    a capital-D `Detail` key to lowercase `detail` in the concerns.ts read paths
+    (readExisting used by aggregateConcerns/mergeConcern, and listConcerns) and
+    drop the legacy key so StoredConcernArtifact typing and longest-wins hold
+    for legacy files. Producer-output capital-D remains rejected by schemas
+    (unchanged)."
+  - No duplicate longest-wins tests were added; the two new cases specifically
+    cover legacy capital-D read normalization and its interaction with
+    longest-wins.
+notes: "Develop-step guidance: implement a single normalizeStoredConcern helper
+  in src/core/concerns.ts that, when reading a stored concern, maps legacy
+  `Detail` to lowercase `detail` (only when lowercase detail is absent), removes
+  the legacy key, and is applied in readExisting for concern reads and in
+  listConcerns. Keep JSON schemas/step-runner write gate unchanged (capital-D
+  producer payloads stay rejected). Do not add migration of remarkables.
+  Expected develop verification: the two declared tests turn green with no other
+  test changes."
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..4baa306
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,92 @@
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
+        durationMs: 4266
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 106498
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-g3qs7R/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 428459
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 428459
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 428459
+
+           469 pass
+           2 skip
+           0 fail
+           2806 expect() calls
+          Ran 471 tests across 71 files. [106.34s]
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
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794230908938-gcwkfqtf6sv.xml
+      junitCaseCount: 7
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
+        - legacy capital-D stored concerns normalize to lowercase detail.lists a
+          legacy capital-D detail as lowercase detail without the legacy key
+        - legacy capital-D stored concerns normalize to lowercase detail.keeps
+          the legacy capital-D stored detail when a shorter lowercase detail is
+          re-emitted
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 16/300 production lines changed"
+    details:
+      changedLines:
+        added: 12
+        deleted: 4
+        total: 16
+        files:
+          - plugins/software-factory/src/core/concerns.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..03b6380
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,71 @@
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
+  "slug": "schema-detail-normalize-v4",
+  "kind": "dev",
+  "title": "Lowercase detail in producer schemas + merge fix (final retry)",
+  "assignment": "FINAL RETRY (closes QA-exhausted v3 per decision 026). Baseline is RED. Normalize concern Detail (capital-D) to detail (lowercase-d) in 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (~:33) AND newConcerns[].Detail (~:65) to match generated review-schema.ts which already emits lowercase-d for both. TS fix at plugins/software-factory/src/core/concerns.ts:74: change guard's existing?.Detail capital-D read to lowercase-d detail read, restoring longest-wins and StoredConcernArtifact typing. Fix ALL positive stored reads to lowercase-d via :raw verification (never rely on grep alone): plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 and plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep funnel-text-budget.test.ts + any other :raw Detail reads. PRESERVE capital-D in all negative-casing fixtures: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip; rejection/absence/expect-error stay capital-D. Do NOT add duplicate longest-wins tests (they exist). Add suggestions-casing assertion to reference-review-schema contract test: suggestions[].properties.detail exists lowercase-d AND suggestions[].properties.Detail absent. Do NOT touch triage/infra/pm-edit. Interfaces: step-runner validation -> runtime schemas (lowercase accepted, capital rejected pre-write); aggregateConcerns/mergeConcern carry lowercase longest-wins; contract suites assert schemas + StoredConcernArtifact. Verify: tsc --noEmit clean, TMPDIR=/tmp bun test contracts + longest-wins + epic-saga green, then TMPDIR=/tmp full suite green.",
+  "outlineRef": "schema-detail-normalize-v4",
+  "milestone": "m0-detail-normalize",
+  "wave": 1,
+  "scenarioRefs": [
+    "m0-detail-normalize:1",
+    "m0-detail-normalize:2",
+    "m0-detail-normalize:3",
+    "m0-detail-normalize:4"
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
+    "legacy capital-D stored concerns normalize to lowercase detail.lists a legacy capital-D detail as lowercase detail without the legacy key",
+    "legacy capital-D stored concerns normalize to lowercase detail.keeps the legacy capital-D stored detail when a shorter lowercase detail is re-emitted"
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
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..7a7c070
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T13:20:37.230Z
+session: 01a1c077-c6db-7104-b76f-470bf80f3295
+endedAt: 2026-11-09T13:28:29.818Z
+usage:
+  inputTokens: 45873
+  outputTokens: 11629
+  costUsd: 0.016319
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T13-20-37-595Z_01a1c077-c6db-7104-b76f-470bf80f3295
diff --git a/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..9a2112e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v4/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,50 @@
+status: ok
+summary: Normalized legacy capital-D concern reads to the lowercase detail
+  contract in src/core/concerns.ts via a shared normalizeStoredConcern helper
+  applied to every stored-read surface (readExisting, legacyConcern,
+  listConcerns, countConcerns). This restores StoredConcernArtifact typing on
+  listConcerns and longest-wins merge behavior for legacy records. Producer
+  schemas and review.schema.json already emitted lowercase detail in the
+  baseline, and the positive stored-read assertions were already lowercase, so
+  no schema/test edits were needed. Target suite is green, contracts + epic-saga
+  propagation pass, full suite passes 469/469 (2 skipped), and tsc --noEmit is
+  clean.
+target:
+  selectors:
+    - test/contracts/schema-detail-normalize.test.ts
+  expectRed:
+    - legacy capital-D stored concerns normalize to lowercase detail.lists a
+      legacy capital-D detail as lowercase detail without the legacy key
+    - legacy capital-D stored concerns normalize to lowercase detail.keeps the
+      legacy capital-D stored detail when a shorter lowercase detail is
+      re-emitted
+evidence:
+  - "RED baseline: TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts -> 5 pass / 2 fail, both
+    legacy normalization tests received undefined or the shorter detail"
+  - "GREEN target: TMPDIR=/tmp bun test
+    test/contracts/schema-detail-normalize.test.ts -> 7 pass, 0 fail, 65
+    expect() calls"
+  - "Contracts suite: TMPDIR=/tmp bun test test/contracts -> 24 pass, 0 fail
+    across 4 files"
+  - "Epic saga propagation: TMPDIR=/tmp bun test
+    test/engine/epic-saga-propagate.test.ts -> 7 pass, 0 fail"
+  - "Full suite: TMPDIR=/tmp bun test -> 469 pass, 2 skip, 0 fail, 2806 expect()
+    calls, 471 tests across 71 files (exit 0)"
+  - "Typecheck: bunx tsc --noEmit -> exit 0 (TSC_OK)"
+  - "Schema casing verified via grep: lowercase detail present in decisions,
+    developer-output, fact-finder-output, plan, plan-closeup, review
+    (suggestions + newConcerns), wave-closeup; no capital-D Detail in
+    config/schemas"
+  - Working diff limited to plugins/software-factory/src/core/concerns.ts
+    (+12/-4 lines)
+concerns:
+  - The assignment's schema edits (6 producer schemas + review.schema.json
+    suggestions[].Detail/newConcerns[].Detail) and lowercase positive
+    stored-read assertions were already present in the baseline; the only actual
+    red was legacy capital-D read normalization, which this change fixes
+  - normalizeStoredConcern prefers an existing lowercase detail over a legacy
+    capital-D Detail when both keys are present, treating lowercase as canonical
+notes: The helper drops the legacy Detail key from the returned object so
+  downstream writes never persist the legacy spelling, and mergeConcern's
+  byte-based longest-wins check now sees the legacy stored text.
diff --git a/plugins/software-factory/src/core/concerns.ts b/plugins/software-factory/src/core/concerns.ts
index e585a36..dcf5c96 100644
--- a/plugins/software-factory/src/core/concerns.ts
+++ b/plugins/software-factory/src/core/concerns.ts
@@ -61,8 +61,16 @@ export function concernFingerprint(c: ConcernInput): string {
   return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
 }
 
+/** Legacy records stored the detail as capital-D `Detail`; every read surface exposes only the lowercase contract key. */
+function normalizeStoredConcern<T>(record: T): T {
+  const obj = record as Obj | null | undefined;
+  if (!obj || !Object.hasOwn(obj, "Detail")) return record;
+  const { Detail, ...rest } = obj;
+  return { ...rest, detail: rest.detail ?? Detail } as T;
+}
+
 async function readExisting<T>(file: string): Promise<T | undefined> {
-  try { return await readYaml<T>(file); } catch (err: any) {
+  try { return normalizeStoredConcern(await readYaml<T>(file)); } catch (err: any) {
     if (err?.code === "ENOENT") return undefined;
     throw err;
   }
@@ -110,7 +118,7 @@ async function legacyConcern(dir: string, input: ConcernInput): Promise<{ file:
     if (!name.startsWith("c-") || !name.endsWith(".yaml")) continue;
     const candidate = path.join(dir, name);
     try {
-      const record = await readYaml<StoredConcernArtifact>(candidate);
+      const record = normalizeStoredConcern(await readYaml<StoredConcernArtifact>(candidate));
       if (record?.kind !== input.kind || typeof record?.summary !== "string") continue;
       const [rfile, rline] = locationOf(record.location);
       if (norm(record.summary) !== norm(input.summary) || rfile !== file || rline !== line) continue;
@@ -176,7 +184,7 @@ export async function listConcerns(taskDir: string): Promise<StoredConcernArtifa
     throw err;
   }
   const records = await Promise.all(names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).map(async (name) => {
-    try { return await readYaml<StoredConcernArtifact>(path.join(dir, name)); } catch { return undefined; }
+    try { return normalizeStoredConcern(await readYaml<StoredConcernArtifact>(path.join(dir, name))); } catch { return undefined; }
   }));
   return records
     .filter((r): r is StoredConcernArtifact => typeof r?.kind === "string")
@@ -205,7 +213,7 @@ export async function countConcerns(taskDir: string): Promise<ConcernCounts> {
   }
   for (const name of names.filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))) {
     try {
-      const concern = await readYaml<StoredConcernArtifact>(path.join(dir, name));
+      const concern = normalizeStoredConcern(await readYaml<StoredConcernArtifact>(path.join(dir, name)));
       if (typeof concern?.kind === "string" && Object.hasOwn(counts, concern.status)) {
         counts[concern.status as keyof ConcernCounts]++;
       }
diff --git a/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
index 75f98f0..fca3e73 100644
--- a/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
+++ b/plugins/software-factory/test/contracts/schema-detail-normalize.test.ts
@@ -4,8 +4,8 @@ import os from "node:os";
 import path from "node:path";
 import { createAjv } from "../../src/core/config/ajv.js";
 import { resolveStepSchema, runAgentStep } from "../../src/core/flows/step-runner.js";
-import { aggregateConcerns } from "../../src/core/concerns.js";
-import { readYaml } from "../../src/core/records/io.js";
+import { aggregateConcerns, concernFingerprint, listConcerns } from "../../src/core/concerns.js";
+import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
 import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
 import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
 import { Repo } from "../../src/core/git/repo.js";
@@ -110,6 +110,22 @@ describe("lowercase concern detail in producer schemas", () => {
     expect(
       validate({ ...base, newConcerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
     ).toBe(false);
+
+    expect(schema.properties?.suggestions?.items?.properties?.detail).toEqual({ type: "string" });
+    expect(schema.properties?.suggestions?.items?.properties?.Detail).toBeUndefined();
+    expect(schema.properties?.suggestions?.items?.additionalProperties).toBe(false);
+    expect(
+      validate({
+        ...base,
+        suggestions: [{ id: "s-1", disposition: "fix", summary: "Lowercase", detail: "kept" }],
+      })
+    ).toBe(true);
+    expect(
+      validate({
+        ...base,
+        suggestions: [{ id: "s-2", disposition: "fix", summary: "Capital", Detail: "wrong" }],
+      })
+    ).toBe(false);
   });
 });
 
@@ -267,3 +283,71 @@ describe("concern detail merge keeps the longest stored value", () => {
     expect(stored.detail).toBe(storedDetail);
   });
 });
+
+/**
+ * Legacy stored concerns written before the lowercase-detail contract used a
+ * capital-D `Detail` key. Every read surface must surface those records as
+ * `StoredConcernArtifact` (lowercase `detail`, no legacy key) and must still
+ * let the longer stored text win when the concern is re-emitted.
+ */
+describe("legacy capital-D stored concerns normalize to lowercase detail", () => {
+  let taskDir: string;
+
+  beforeEach(() => {
+    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-detail-legacy-"));
+  });
+
+  afterEach(() => fs.rmSync(taskDir, { recursive: true, force: true }));
+
+  const legacyRecord = (id: string, detail: string): Record<string, unknown> => ({
+    id,
+    kind: "risk",
+    summary: "Legacy stored concern",
+    Detail: detail,
+    severity: "high",
+    status: "open",
+    source: { record: "000-legacy-develop-a1", agent: "developer" },
+    createdAt: "2026-01-01T00:00:00.000Z",
+    updatedAt: "2026-01-01T00:00:00.000Z",
+  });
+
+  it("lists a legacy capital-D detail as lowercase detail without the legacy key", async () => {
+    const longDetail = "L".repeat(200);
+    await writeYamlAtomic(
+      path.join(taskDir, "concerns", "c-legacy.yaml"),
+      legacyRecord("c-legacy", longDetail)
+    );
+
+    const listed = await listConcerns(taskDir);
+
+    expect(listed).toHaveLength(1);
+    expect(listed[0]!.detail).toBe(longDetail);
+    expect((listed[0] as unknown as Record<string, unknown>).Detail).toBeUndefined();
+  });
+
+  it("keeps the legacy capital-D stored detail when a shorter lowercase detail is re-emitted", async () => {
+    const input = { kind: "risk", summary: "Legacy stored concern" } as const;
+    const id = concernFingerprint(input);
+    const longDetail = "L".repeat(200);
+    const shortDetail = "s".repeat(20);
+    await writeYamlAtomic(
+      path.join(taskDir, "concerns", `${id}.yaml`),
+      legacyRecord(id, longDetail)
+    );
+
+    const merged = await aggregateConcerns(
+      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
+      [{ ...input, detail: shortDetail }],
+      [],
+      { commit: false }
+    );
+
+    expect(merged).toHaveLength(1);
+    expect(merged[0]!.detail).toBe(longDetail);
+    const stored = await readYaml<Record<string, any>>(
+      path.join(taskDir, "concerns", `${id}.yaml`)
+    );
+    expect(stored.detail).toBe(longDetail);
+    expect(stored.Detail).toBeUndefined();
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
