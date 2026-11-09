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
  "slug": "prompts-dismiss-filter",
  "kind": "dev",
  "title": "Dismiss criteria row + prompt filtering",
  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
  "outlineRef": "prompts-dismiss-filter",
  "milestone": "m1-dismiss-contract",
  "wave": 1,
  "scenarioRefs": [
    "m1-dismiss-contract:s1",
    "m1-dismiss-contract:s2",
    "m1-dismiss-contract:s3",
    "m1-dismiss-contract:s4"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/decisions/024-item-prompts-dismiss-filter.yaml b/.factory/tasks/concerns-funnel/decisions/024-item-prompts-dismiss-filter.yaml
deleted file mode 100644
index 43842ca..0000000
--- a/.factory/tasks/concerns-funnel/decisions/024-item-prompts-dismiss-filter.yaml
+++ /dev/null
@@ -1,24 +0,0 @@
-id: decision-prompts-dismiss-filter-1794213525197
-context: item
-item: prompts-dismiss-filter
-afterRecord: 003-develop-r1-a2
-decision: retry-with-guidance
-timestamp: 2026-11-09T08:38:45.197Z
-rationale: "Both develop attempts failed on yield shape, not code: 'Agent output
-  failed schema validation: /: must be object'. The diff shows the
-  implementation landed (dispositions.md +2, prompts.ts +10/-9, prompts.test.ts
-  +92/-6), so the work is likely done but the final yield was emitted as a bare
-  string/diff instead of the required DeveloperOutputArtifact object. Retry
-  needs zero code changes — only a correctly shaped yield."
-text: "Retry develop as a yield-only round: make NO code changes (diff already
-  implements the row + filter + test). Your entire job is to emit a valid
-  DeveloperOutputArtifact OBJECT via the yield tool: { status: 'ok', summary:
-  '<1-2 sentences on dismiss row + filter + QA/reviewer test + gates>',
-  evidence: ['typecheck command + result', 'TMPDIR=/tmp bun test result'] }. Do
-  NOT yield a bare string, a diff, or prose outside the object — that is exactly
-  what failed twice ('/: must be object'). Before yielding, re-run cd
-  plugins/software-factory && bun run typecheck and TMPDIR=/tmp bun test
-  test/prompts.test.ts (full suite if quick) and quote results in evidence. If
-  those fail, report status failed with the failure output instead of another
-  malformed ok."
-persist: true
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..85372a4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,77 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/prompts.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 3 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test test/prompts.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794211779215-ip9mqkosarb.xml
+      junitCaseCount: 25
+      junitCaseIds:
+        - "prompts: PromptLibrary & preflightPrompts.loads agent definition with
+          frontmatter tools, description, and body"
+        - "prompts: PromptLibrary & preflightPrompts.step fragments no longer
+          duplicate agent-level shared includes"
+        - "prompts: PromptLibrary & preflightPrompts.throws with descriptive
+          error listing missing variables when render fails"
+        - "prompts: PromptLibrary & preflightPrompts.overrides directory shadows
+          builtin directory"
+        - "prompts: PromptLibrary & preflightPrompts.in-memory overrides shadow
+          both override directories and builtin"
+        - "prompts: PromptLibrary & preflightPrompts.preflight passes with zero
+          errors on real pipeline.default.yaml"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          agent definitions"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          step fragments"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          placeholders that the engine does not supply"
+        - "prompts: PromptLibrary & preflightPrompts.preflight covers every
+          engine-invoked orchestration fragment"
+        - "prompts: PromptLibrary & preflightPrompts.preflight render check
+          fails when a fragment needs vars outside KNOWN_VARS"
+        - "prompts: PromptLibrary & preflightPrompts.loadCriteriaBundle reads
+          declared criteria files and skips missing ones"
+        - "prompts: PromptLibrary & preflightPrompts.formatDispositionsSection
+          lists allowed set and filters human-stop"
+        - "prompts: PromptLibrary & preflightPrompts.close-up step fragments
+          bind to closeup schemas, not the review shape"
+        - "prompts: PromptLibrary & preflightPrompts.review-type step fragments
+          consume dispositionsCriteria"
+        - "prompts: PromptLibrary & preflightPrompts.every agent definition
+          includes the workspace containment instructions"
+        - "prompts: PromptLibrary & preflightPrompts.infra agent prompt and
+          schema instruct recording red gates as baseline without workarounds"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).documents a terse triager-only dismiss row
+          and rule kept on disk"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).filters dismiss rows and rules unless the
+          allowed set includes dismiss"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).renders dismiss criteria for triager
+          reviewers but not QA"
+        - "prompts: concern fragment matrix
+          (adr-prompt-fragment-matrix).registers concernsYaml for every
+          concern-producing and triaging fragment"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders
+          Open Concerns and Raise concerns instructions on all 19 matrix
+          fragments"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders
+          Human involvement criteria and the condense rule on triage fragments"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).keeps
+          per-fragment additions <=15 non-empty lines and total additions <=80"
+        - "prompts: concern fragment matrix
+          (adr-prompt-fragment-matrix).switches autonomous and detailed criteria
+          inside a rendered matrix fragment"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..1f6fab1
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/input.md
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
+  "slug": "prompts-dismiss-filter",
+  "kind": "dev",
+  "title": "Dismiss criteria row + prompt filtering",
+  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
+  "outlineRef": "prompts-dismiss-filter",
+  "milestone": "m1-dismiss-contract",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-dismiss-contract:s1",
+    "m1-dismiss-contract:s2",
+    "m1-dismiss-contract:s3",
+    "m1-dismiss-contract:s4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
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
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..42be2ff
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T08:05:00.362Z
+session: 01a1bf56-d5fe-753e-a0c7-fa4dacc22d52
+endedAt: 2026-11-09T08:09:39.726Z
+usage:
+  inputTokens: 70669
+  outputTokens: 23696
+  costUsd: 0.030991
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-566Z_01a1bf56-d5fe-753e-a0c7-fa4dacc22d52
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..813861a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,62 @@
+status: ok
+summary: "Authored test-first contract for adr-dismiss-criteria-row in
+  plugins/software-factory/test/prompts.test.ts only (production untouched).
+  Added a new describe with 3 tests: (1) dispositions.md must carry a terse
+  dismiss table row (triager-only, reason, kept) plus a dismiss rule bullet; (2)
+  formatDispositionsSection must filter dismiss rows/rules when the allowed set
+  excludes dismiss (QA case) and keep them when it includes dismiss (reviewer
+  case), while still filtering human-stop; (3) end-to-end render test derives
+  allowed sets via resolveReviewAllowed/isTriagerAgent from the real pipeline
+  config and asserts steps/qa excludes dismiss entirely while steps/review
+  retains the exact dismiss criteria row and rule. Moved the existing sampleVars
+  render helper to module scope for reuse instead of duplicating it. All 3 new
+  tests fail on current production with AssertionError (not collection/import
+  errors); existing 22 prompts tests including the fragment matrix and
+  15-per-fragment/80-total budgets remain green."
+target:
+  selectors:
+    - test/prompts.test.ts
+  expectRed:
+    - "prompts: dismiss disposition contract
+      (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and
+      rule kept on disk"
+    - "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters
+      dismiss rows and rules unless the allowed set includes dismiss"
+    - "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders
+      dismiss criteria for triager reviewers but not QA"
+evidence:
+  - "Baseline: `cd plugins/software-factory && TMPDIR=/tmp bun test
+    test/prompts.test.ts` -> 22 pass, 0 fail (test infra verified before writing
+    tests)."
+  - "Red: same command after edits -> 22 pass, 3 fail; all 3 failures are bun
+    AssertionError (`toBeDefined()` on missing dismiss row,
+    `not.toMatch(/dismiss/i)` on unfiltered criteria, `toBeDefined()` on missing
+    row in render test) - no syntax/import/collection errors."
+  - "JUnit probe: `bun test test/prompts.test.ts --reporter=junit
+    --reporter-outfile=/tmp/prompts-junit2.xml` confirms each new testcase is
+    `<failure type=\"AssertionError\">` and yields the exact ids declared in
+    expectRed (classname + '.' + name)."
+  - "Fragment matrix/budgets: the 5 existing matrix/debloat tests in
+    test/prompts.test.ts pass unchanged (part of the 22 green)."
+  - "Full suite: `cd plugins/software-factory && TMPDIR=/tmp bun test` -> 445
+    pass, 2 skip, 3 fail; the only failures are the three new dismiss tests, so
+    no collateral regressions."
+  - "Typecheck: `cd plugins/software-factory && bun run typecheck` -> exit 0
+    (TYPECHECK_OK)."
+  - "Scope: `git status --short` shows only `M test/prompts.test.ts`; no
+    production files changed and no stub files added."
+concerns:
+  - The render test uses the real agents/criteria/dispositions.md content, so
+    the implementation step must add both a `| \`dismiss\` |` table row
+    containing triager/reason/kept wording and a rule bullet mentioning dismiss;
+    filtering must drop any criteria line containing dismiss when it is not
+    allowed (mirroring the human-stop filter) while preserving human-stop
+    behavior.
+  - The QA render assertion requires no /dismiss/i text anywhere in the QA
+    prompt; this holds because agents/steps/qa.md does not mention dismiss
+    today. Future ad-hoc dismiss guidance added to qa.md would intentionally
+    break this contract.
+notes: Test ids are declared in bun's JUnit native form (describe classname +
+  '.' + test name) because the infra testRunner is `cd plugins/software-factory
+  && bun test` with junitArg `--reporter=junit --reporter-outfile={path}` and
+  empty selectorArgs.
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..743c7bb
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,72 @@
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
+  "slug": "prompts-dismiss-filter",
+  "kind": "dev",
+  "title": "Dismiss criteria row + prompt filtering",
+  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
+  "outlineRef": "prompts-dismiss-filter",
+  "milestone": "m1-dismiss-contract",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-dismiss-contract:s1",
+    "m1-dismiss-contract:s2",
+    "m1-dismiss-contract:s3",
+    "m1-dismiss-contract:s4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/prompts.test.ts"
+  ],
+  "expectRed": [
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and rule kept on disk",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters dismiss rows and rules unless the allowed set includes dismiss",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders dismiss criteria for triager reviewers but not QA"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
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
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..1a0d8ef
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,22 @@
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
+status: rejected
+startedAt: 2026-11-09T08:13:50.624Z
+session: 01a1bf62-c23f-7712-9300-1d70fe6686b0
+endedAt: 2026-11-09T08:20:03.540Z
+usage:
+  inputTokens: 45017
+  outputTokens: 13878
+  costUsd: 0.018432
+error: |-
+  Output validation and repair failed: Agent output failed schema validation:
+  /: must be object ({"type":"object"})
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-13-51-222Z_01a1bf5e-eaf6-7524-8631-15bd34c87e37
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/input.md b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/input.md
new file mode 100644
index 0000000..e7bedda
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/input.md
@@ -0,0 +1,78 @@
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
+  "slug": "prompts-dismiss-filter",
+  "kind": "dev",
+  "title": "Dismiss criteria row + prompt filtering",
+  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
+  "outlineRef": "prompts-dismiss-filter",
+  "milestone": "m1-dismiss-contract",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-dismiss-contract:s1",
+    "m1-dismiss-contract:s2",
+    "m1-dismiss-contract:s3",
+    "m1-dismiss-contract:s4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/prompts.test.ts"
+  ],
+  "expectRed": [
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and rule kept on disk",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters dismiss rows and rules unless the allowed set includes dismiss",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders dismiss criteria for triager reviewers but not QA"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+]
+
+## Review Feedback
+Output validation and repair failed: Agent output failed schema validation:
+/: must be object ({"type":"object"})
+
+Budget: 21 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/meta.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..47bef83
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/meta.yaml
@@ -0,0 +1,22 @@
+seq: 3
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-09T08:20:56.632Z
+session: 01a1bf68-5166-77f3-a66b-d884dd0b6cac
+endedAt: 2026-11-09T08:26:03.289Z
+usage:
+  inputTokens: 28331
+  outputTokens: 8156
+  costUsd: 0.010742
+error: |-
+  Output validation and repair failed: Agent output failed schema validation:
+  /: must be object ({"type":"object"})
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-20-57-120Z_01a1bf65-6aa0-7037-a67e-e80af019ce82
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..33e9232
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/checks.yaml
@@ -0,0 +1,134 @@
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
+        durationMs: 4139
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 90871
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-DOpCba/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3032180
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3032180
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3032180
+
+           448 pass
+           2 skip
+           0 fail
+           2488 expect() calls
+          Ran 450 tests across 69 files. [90.73s]
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
+      command: cd plugins/software-factory && bun test test/prompts.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794215018420-3yflln2hsml.xml
+      junitCaseCount: 25
+      junitCaseIds:
+        - "prompts: PromptLibrary & preflightPrompts.loads agent definition with
+          frontmatter tools, description, and body"
+        - "prompts: PromptLibrary & preflightPrompts.step fragments no longer
+          duplicate agent-level shared includes"
+        - "prompts: PromptLibrary & preflightPrompts.throws with descriptive
+          error listing missing variables when render fails"
+        - "prompts: PromptLibrary & preflightPrompts.overrides directory shadows
+          builtin directory"
+        - "prompts: PromptLibrary & preflightPrompts.in-memory overrides shadow
+          both override directories and builtin"
+        - "prompts: PromptLibrary & preflightPrompts.preflight passes with zero
+          errors on real pipeline.default.yaml"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          agent definitions"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          step fragments"
+        - "prompts: PromptLibrary & preflightPrompts.preflight flags unknown
+          placeholders that the engine does not supply"
+        - "prompts: PromptLibrary & preflightPrompts.preflight covers every
+          engine-invoked orchestration fragment"
+        - "prompts: PromptLibrary & preflightPrompts.preflight render check
+          fails when a fragment needs vars outside KNOWN_VARS"
+        - "prompts: PromptLibrary & preflightPrompts.loadCriteriaBundle reads
+          declared criteria files and skips missing ones"
+        - "prompts: PromptLibrary & preflightPrompts.formatDispositionsSection
+          lists allowed set and filters human-stop"
+        - "prompts: PromptLibrary & preflightPrompts.close-up step fragments
+          bind to closeup schemas, not the review shape"
+        - "prompts: PromptLibrary & preflightPrompts.review-type step fragments
+          consume dispositionsCriteria"
+        - "prompts: PromptLibrary & preflightPrompts.every agent definition
+          includes the workspace containment instructions"
+        - "prompts: PromptLibrary & preflightPrompts.infra agent prompt and
+          schema instruct recording red gates as baseline without workarounds"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).documents a terse triager-only dismiss row
+          and rule kept on disk"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).filters dismiss rows and rules unless the
+          allowed set includes dismiss"
+        - "prompts: dismiss disposition contract
+          (adr-dismiss-criteria-row).renders dismiss criteria for triager
+          reviewers but not QA"
+        - "prompts: concern fragment matrix
+          (adr-prompt-fragment-matrix).registers concernsYaml for every
+          concern-producing and triaging fragment"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders
+          Open Concerns and Raise concerns instructions on all 19 matrix
+          fragments"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders
+          Human involvement criteria and the condense rule on triage fragments"
+        - "prompts: concern fragment matrix (adr-prompt-fragment-matrix).keeps
+          per-fragment additions <=15 non-empty lines and total additions <=80"
+        - "prompts: concern fragment matrix
+          (adr-prompt-fragment-matrix).switches autonomous and detailed criteria
+          inside a rendered matrix fragment"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 21/300 production lines changed"
+    details:
+      changedLines:
+        added: 12
+        deleted: 9
+        total: 21
+        files:
+          - plugins/software-factory/agents/criteria/dispositions.md
+          - plugins/software-factory/src/core/prompts.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/input.md
new file mode 100644
index 0000000..ac19799
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/input.md
@@ -0,0 +1,80 @@
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
+  "slug": "prompts-dismiss-filter",
+  "kind": "dev",
+  "title": "Dismiss criteria row + prompt filtering",
+  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
+  "outlineRef": "prompts-dismiss-filter",
+  "milestone": "m1-dismiss-contract",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-dismiss-contract:s1",
+    "m1-dismiss-contract:s2",
+    "m1-dismiss-contract:s3",
+    "m1-dismiss-contract:s4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/prompts.test.ts"
+  ],
+  "expectRed": [
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and rule kept on disk",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters dismiss rows and rules unless the allowed set includes dismiss",
+    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders dismiss criteria for triager reviewers but not QA"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
+  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
+]
+
+## Review Feedback
+Retry develop as a yield-only round: make NO code changes (diff already implements the row + filter + test). Your entire job is to emit a valid DeveloperOutputArtifact OBJECT via the yield tool: { status: 'ok', summary: '<1-2 sentences on dismiss row + filter + QA/reviewer test + gates>', evidence: ['typecheck command + result', 'TMPDIR=/tmp bun test result'] }. Do NOT yield a bare string, a diff, or prose outside the object — that is exactly what failed twice ('/: must be object'). Before yielding, re-run cd plugins/software-factory && bun run typecheck and TMPDIR=/tmp bun test test/prompts.test.ts (full suite if quick) and quote results in evidence. If those fail, report status failed with the failure output instead of another malformed ok.
+
+Output validation and repair failed: Agent output failed schema validation:
+/: must be object ({"type":"object"})
+
+Budget: 21 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..304a780
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 4
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
+startedAt: 2026-11-09T08:59:45.839Z
+session: 01a1bf88-f4a2-757c-84ce-bb3215dad722
+endedAt: 2026-11-09T09:03:38.812Z
+usage:
+  inputTokens: 21254
+  outputTokens: 5221
+  costUsd: 0.006934
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-59-46-210Z_01a1bf88-f4a2-757c-84ce-bb3215dad722
diff --git a/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..49a03bd
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/004-develop-r1-a1/output.yaml
@@ -0,0 +1,39 @@
+status: ok
+summary: "No code changes this round (diff already committed): dispositions.md
+  carries the terse triager-only dismiss row/rule kept on disk,
+  formatDispositionsSection now drops dismiss rows/rules unless the allowed set
+  includes dismiss, and test/prompts.test.ts locks QA-excludes vs
+  reviewer-includes rendering. Typecheck and the target test file are green."
+target:
+  selectors:
+    - test/prompts.test.ts
+  expectRed:
+    - "prompts: dismiss disposition contract
+      (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and
+      rule kept on disk"
+    - "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters
+      dismiss rows and rules unless the allowed set includes dismiss"
+    - "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders
+      dismiss criteria for triager reviewers but not QA"
+evidence:
+  - cd plugins/software-factory && bun run typecheck -> tsc --noEmit,
+    TYPECHECK_EXIT=0 (4.4s)
+  - "cd plugins/software-factory && TMPDIR=/tmp bun test test/prompts.test.ts ->
+    bun test v1.4.4: 25 pass, 0 fail, 320 expect() calls, TEST_EXIT=0 (276ms);
+    includes the three dismiss-contract cases (documents row/rule, filters
+    unless allowed, triager-includes/QA-excludes)"
+  - "git status --short clean; implementation is committed: 7e02545 adds the
+    dismiss row/rule to agents/criteria/dispositions.md and the dismiss
+    exclusion to formatDispositionsSection in src/core/prompts.ts; 669f646 adds
+    the render tests in test/prompts.test.ts"
+  - Diff is 21 prod lines vs storyMaxProdLines 300; test file fragment matrix
+    and debloat budgets pass within the 25/25 green run
+  - "Verified dismissal doc content: row marked triager-only, reason required,
+    concern kept on disk; rule mirrored on line 20"
+concerns:
+  - Full `bun test` suite was launched in the background but that job no longer
+    exists after the session restart, so only the declared target selector plus
+    typecheck gate were re-confirmed; no other test files were changed by this
+    story.
+notes: Yield-only round per review feedback; no edits made, existing committed
+  diff is the implementation.
diff --git a/.factory/tasks/concerns-funnel/journal.ndjson b/.factory/tasks/concerns-funnel/journal.ndjson
index a7f11d9..6276383 100644
--- a/.factory/tasks/concerns-funnel/journal.ndjson
+++ b/.factory/tasks/concerns-funnel/journal.ndjson
@@ -2089,46 +2089,3 @@
 {"type":"step_started","task":"concerns-funnel","step":"pm-edits-4","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/087-pm-edits-4-a1","ts":"2026-11-09T08:03:47.749Z"}
 {"type":"step_timeout_armed","task":"concerns-funnel","step":"pm-edits-4","timeoutSec":2700,"ts":"2026-11-09T08:03:47.755Z"}
 {"type":"step_finished","task":"concerns-funnel","step":"pm-edits-4","attempt":1,"status":"ok","sessionId":"01a1bf55-b743-72e1-8265-3d690f3dba2d","usage":{"inputTokens":20134,"outputTokens":9911,"costUsd":0.003996},"ts":"2026-11-09T08:04:57.457Z"}
-{"type":"wave_started","wave":1,"iteration":4,"ts":"2026-11-09T08:04:59.518Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize-v2/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/001-test-first-r1-a1","ts":"2026-11-09T08:05:00.768Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T08:05:00.775Z"}
-{"type":"step_started","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--prompts-dismiss-filter/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1","ts":"2026-11-09T08:05:01.055Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T08:05:01.063Z"}
-{"type":"step_started","task":"concerns-funnel","item":"allowlist-agreement-test","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--allowlist-agreement-test/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/001-develop-r1-a1","ts":"2026-11-09T08:05:01.363Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"allowlist-agreement-test","step":"develop","timeoutSec":5400,"ts":"2026-11-09T08:05:01.372Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"allowlist-agreement-test","step":"develop","attempt":1,"status":"ok","sessionId":"01a1bf56-d737-75c8-acca-1ffc75ffe105","usage":{"inputTokens":10019,"outputTokens":3313,"costUsd":0.004067},"ts":"2026-11-09T08:07:57.920Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"test-first","attempt":1,"sizeBytes":5737690,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-566Z_01a1bf56-d5fe-753e-a0c7-fa4dacc22d52","ts":"2026-11-09T08:09:39.179Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"test-first","attempt":1,"toolCalls":70,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-566Z_01a1bf56-d5fe-753e-a0c7-fa4dacc22d52","ts":"2026-11-09T08:09:39.180Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1bf56-d5fe-753e-a0c7-fa4dacc22d52","usage":{"inputTokens":70669,"outputTokens":23696,"costUsd":0.030991},"ts":"2026-11-09T08:09:39.778Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"test-first","attempt":1,"sizeBytes":12002523,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-239Z_01a1bf56-d4b7-7649-9fd1-563e549e1900.jsonl","ts":"2026-11-09T08:13:46.153Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"test-first","attempt":1,"toolCalls":114,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-05-01-239Z_01a1bf56-d4b7-7649-9fd1-563e549e1900.jsonl","ts":"2026-11-09T08:13:46.153Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1bf56-d4b7-7649-9fd1-563e549e1900","usage":{"inputTokens":115165,"outputTokens":49620,"costUsd":0.064955},"ts":"2026-11-09T08:13:46.990Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize-v2/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/002-develop-r1-a1","ts":"2026-11-09T08:13:50.671Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","timeoutSec":5400,"ts":"2026-11-09T08:13:50.675Z"}
-{"type":"step_started","task":"concerns-funnel","item":"allowlist-agreement-test","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--allowlist-agreement-test/.factory/tasks/concerns-funnel/items/allowlist-agreement-test/steps/002-review-r1-a1","ts":"2026-11-09T08:13:50.712Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"allowlist-agreement-test","step":"review","timeoutSec":3600,"ts":"2026-11-09T08:13:50.718Z"}
-{"type":"step_started","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--prompts-dismiss-filter/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1","ts":"2026-11-09T08:13:50.758Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","timeoutSec":5400,"ts":"2026-11-09T08:13:50.765Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"allowlist-agreement-test","step":"review","attempt":1,"status":"ok","sessionId":"01a1bf5e-ea8b-7529-89d1-4476a9da27ff","usage":{"inputTokens":16704,"outputTokens":2897,"costUsd":0.002363},"ts":"2026-11-09T08:14:24.903Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:16:06.387Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:16:09.121Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:16:23.830Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:16:26.034Z"}
-{"type":"step_output_repaired","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","attempt":1,"method":"ask","ts":"2026-11-09T08:18:47.600Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1bf5e-eaf6-7524-8631-15bd34c87e37","usage":{"inputTokens":45017,"outputTokens":13878,"costUsd":0.018432},"ts":"2026-11-09T08:20:03.597Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"develop","attempt":1,"status":"ok","sessionId":"01a1bf5e-ea98-7275-a524-4b527059cee4","usage":{"inputTokens":34335,"outputTokens":9729,"costUsd":0.013926000000000001},"ts":"2026-11-09T08:20:52.942Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize-v2/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/003-qa-r1-a1","ts":"2026-11-09T08:20:56.665Z"}
-{"type":"step_started","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--prompts-dismiss-filter/.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2","ts":"2026-11-09T08:20:56.701Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","timeoutSec":5400,"ts":"2026-11-09T08:20:56.707Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"qa","timeoutSec":5400,"ts":"2026-11-09T08:20:58.405Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:22:34.278Z"}
-{"type":"harness_model_fallback","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24620 | ` + \"Then use /model to select a model.\");\n24621 |       }\n24622 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24623 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24624 |         if (f.signal.aborted)\n24625 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Qn (/$bunfs/root/chunks/cli-wj6mg3cq.js:24625:15)\n      at async #_o (/$bunfs/root/chunks/cli-wj6mg3cq.js:24316:25)\n      at async #Aa (/$bunfs/root/chunks/cli-wj6mg3cq.js:24172:30)\n      at async #Ns (/$bunfs/root/chunks/cli-wj6mg3cq.js:20916:28)","ts":"2026-11-09T08:22:36.477Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"prompts-dismiss-filter","step":"develop","attempt":2,"status":"rejected","sessionId":"01a1bf65-6aa0-7037-a67e-e80af019ce82","usage":{"inputTokens":28331,"outputTokens":8156,"costUsd":0.010742},"ts":"2026-11-09T08:26:03.355Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"qa","attempt":1,"sizeBytes":9414118,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-20-58-780Z_01a1bf65-711c-7465-a89c-357b93dcc522.jsonl","ts":"2026-11-09T08:37:54.390Z"}
-{"type":"step_tool_call_warning","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"qa","attempt":1,"toolCalls":94,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T08-20-58-780Z_01a1bf65-711c-7465-a89c-357b93dcc522.jsonl","ts":"2026-11-09T08:37:54.391Z"}
-{"type":"step_finished","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"qa","attempt":1,"status":"ok","sessionId":"01a1bf65-711c-7465-a89c-357b93dcc522","usage":{"inputTokens":75581,"outputTokens":66252,"costUsd":0.024741},"ts":"2026-11-09T08:37:54.465Z"}
-{"type":"step_started","task":"concerns-funnel","step":"consult-prompts-dismiss-filter","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1","ts":"2026-11-09T08:37:58.103Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","step":"consult-prompts-dismiss-filter","timeoutSec":7200,"ts":"2026-11-09T08:37:58.107Z"}
-{"type":"step_started","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--schema-detail-normalize-v2/.factory/tasks/concerns-funnel/items/schema-detail-normalize-v2/steps/004-review-r1-a1","ts":"2026-11-09T08:37:58.140Z"}
-{"type":"step_timeout_armed","task":"concerns-funnel","item":"schema-detail-normalize-v2","step":"review","timeoutSec":3600,"ts":"2026-11-09T08:37:58.146Z"}
-{"type":"step_transcript_size_warning","task":"concerns-funnel","step":"consult-prompts-dismiss-filter","attempt":1,"sizeBytes":13444763,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl","ts":"2026-11-09T08:38:45.191Z"}
diff --git a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/input.md b/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/input.md
deleted file mode 100644
index 489d51b..0000000
--- a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/input.md
+++ /dev/null
@@ -1,825 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)
-
-## 0. Snapshot (verified 2026-11-09)
-
-| Fact | Evidence |
-|---|---|
-| Task | spec item 18 of `docs/factory.v2.md:89-103` (acceptance definition) |
-| Code state | plugin sources committed at worktree HEAD `b3450c9` (`factory: context-pack-4 a1`); plugin tree clean (only factory journal dirty) |
-| Test health | `cd plugins/software-factory && bun test` → **445 pass, 2 skip, 0 fail**, 2468 expect() calls, 69 files, 105s |
-| Concern-focused subset | 17 files / **137 pass, 0 fail** (concerns-funnel, reviewer-triage, plan-reviewer-triage, funnel-text-budget, human-router-severity, routing-*, state-concern-counts, adr-blocking-digest, epic-saga-propagate, closeup-lifecycle-resolve, human-involvement-config, cli/status-concerns, contracts/*) |
-| Implementation status | item 18 is materially implemented (store, fingerprint/dedup, triage+dismiss, routing, funnel, ADRs, human modes, close-up/status/state surfacing). Docs were **not** updated: `plugins/software-factory/docs/ARCHITECTURE.md:39` still says "Deliberately not hand-built … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only" |
-| Repository ADRs | 16 one-paragraph ADRs written by the architect under `docs/adr/` (project `adrFolder`, `plugins/software-factory/config/project.template.yaml:11`) |
-| Active human mode | default `autonomous`; repo `.factory/pipeline.yaml` absent → only default + repo layers apply |
-
-> Containment note: `.factory/tasks/**` is orchestration state and is intentionally not inspected here; all claims below come from plugin sources, schemas, prompts, docs and tests.
-
----
-
-## 1. Module Map
-
-### 1.1 Core concern subsystem
-
-| File | Responsibility | Key ranges |
-|---|---|---|
-| `plugins/software-factory/src/core/concerns.ts` (406 L) | The concern store: stable fingerprint ids, per-file dedup/merge, aggregation with immediate commit, status vocabulary, triage application, close-up proposals/confirms, decision-level resolution, wave fallback, crash reconcile | `:35-44` allowlist, `:46-60` ids, `:69-97` merge, `:121-166` aggregate, `:184-215` counts, `:250-261` triage, `:263-304` close-up lifecycle, `:311-326` resolution, `:335-351` wave fallback, `:353-362` partition, `:388-406` reconcile |
-| `plugins/software-factory/src/core/triage.ts` (349 L) | Pure triage/routing helpers: partition by exact id, severity policy, single human-disposition router (digest vs blocking), debt predicate, terse hydration + byte-capped rendering, `applyReviewTriage` | `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-149`, `:152-165`, `:200-247`, `:254-286`, `:293-349` |
-| `plugins/software-factory/src/core/review-policy.ts` (43 L) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; appends `dismiss` for triagers only | `:4-20`, `:27-43` |
-| `plugins/software-factory/src/core/flows/step-runner.ts` (923 L) | Post-step ingest: aggregates produced concerns/remarkables, applies triage on pre-existing ids only, records close-up resolutions, honors/ignores decision-level resolutions, applies architect confirms + epic propagation, wave fallback; resolves schema/dispositions and hydrates `concernsYaml` | `:194-322`, `:325-341`, `:409-449` |
-| `plugins/software-factory/src/core/flows/iteration.ts` (1337 L) | Architect plan/revise (ADR persistence), plan-review wiring (plan-reviewer is the triager for architect output), wave-level routed-blocker consults | `:170-177`, `:179-229`, `:441-451`, `:517-549`, `:614-623`, `:810-933` |
-| `plugins/software-factory/src/core/flows/item-machine.ts` (811 L) | Item review prompt wiring (`dispositionsCriteria`, `reviewAllowed`) and suppression of duplicate raw human dispositions for concern ids | `:663-665`, `:714-744`, `:766-810` |
-| `plugins/software-factory/src/core/flows/consults.ts` (421 L) | `consult-concern-<id>` architect consult for a routed blocker; decision may carry `concernResolution` | `:326-421` |
-| `plugins/software-factory/src/core/flows/epic-propagation.ts` (185 L) | Epic→saga concern push: condensed copies, `[epic]` summaries, forwarded blocked questions | `:17-36`, `:97-129`, `:141-150`, `:152-185` |
-| `plugins/software-factory/src/core/flows/adrs.ts` (72 L) | Blocking vs remarkable ADR: markdown record + mailbox routing under the active mode | `:14-18`, `:20-37`, `:46-71` |
-
-### 1.2 Derivation, engine, CLI
-
-| File | Responsibility | Key ranges |
-|---|---|---|
-| `src/core/derive/task.ts` (441 L) | `collectRoutedBlockers` (kind `blocker` + status `routed` + severity ≥ `minBlockingSeverity`); maps routed blocking onto item state; debt list incl. concern debt; `concerns` counts on state | `:47-65`, `:174-190`, `:219-250`, `:369-385` |
-| `src/core/derive/item.ts` | Applies routed-concern blocking to pending items (`withRoutedBlocking`) | `:59-90` |
-| `src/core/derive/wave.ts` | Wave state carries concern-blocked items; transitive fixpoint over declared deps | `:27`, `:47`, `:73` |
-| `src/core/plan/scheduler.ts` | `blockedByConcern(...)` failure-union fixpoint used by iteration/scheduler | `:60-90` |
-| `src/core/engine.ts` (795 L) | Startup: commit engine-owned concern store (`factory: concern store recovery`), reconcile concerns from committed records; epic child finish: `propagateEpicConcerns` + child-closeup commit | `:266-289`, `:342-347`, `:383-394` |
-| `src/core/prompts.ts` (597 L) | `loadCriteriaBundle`, `formatHumanInvolvementCriteria` (selects `## <mode>` + shared table), `formatDispositionsSection` (allowed set, drops `human-stop` unless allowed) | `:35-59`, `:61-84`, `:86-110` |
-| `src/core/prompt-vars.ts` (171 L) | `KNOWN_VARS` fragment matrix (which steps get `concernsYaml` / `humanInvolvementCriteria`) and var descriptions | `:12-40`, `:46-171` |
-| `src/core/records/review-schema.ts` (104 L) | Generates the review schema with the agent's allowed disposition enum; declares `remarkable` and `newConcerns` | `:5-104` |
-| `src/cli/status.ts` (128 L) | `factory status`: concern counts line + blocking vs digest question split + recorded debt | `:84-124` (counts `:106-108`) |
-| `src/core/steer.ts` (188 L) | Mailbox writer: deterministic id fallback, never clobbers an operator answer | `:63-110` |
-
-### 1.3 Schemas, config, prompts, docs
-
-| Area | Files |
-|---|---|
-| Artifact schemas with `concerns`/`remarkable` | `config/schemas/developer-output.schema.json:61-83`, `fact-finder-output.schema.json:22-40`, `plan.schema.json:120-158`, `decisions.schema.json:48-95` (+`concernConfirms` `:73-83`, `concernResolution` `:84-95`), `review.schema.json:47-99` (`remarkable` 47-58, `newConcerns` 59-99), `wave-closeup.schema.json:35-70`, `plan-closeup.schema.json:27-70` |
-| State/pipeline schemas | `config/schemas/state.schema.json:72-100` (required counts), `pipeline.schema.json:203-229` (`humanInvolvement`, `concerns`) |
-| Config | `config/pipeline.default.yaml:359-376` (reviewPolicy), `:378-432` (§18 block: mode, allowlist, thresholds, commented presets, ADR blocking table), `:434-456` (criteria registry); `config/project.template.yaml:11` (`adrFolder: docs/adr`) |
-| Prompts | `agents/criteria/human-involvement.md` (mode table + per-mode sections), `agents/steps/review.md:15-24`, `agents/steps/plan-review.md:14-37`, `agents/steps/qa.md:30+`, `agents/steps/develop.md:21-22`, `agents/steps/architect-*.md` (all bind `humanInvolvementCriteria`/`concernsYaml`), `agents/architect.md:33` (ADR blocking rule) |
-| Docs | `plugins/software-factory/docs/ARCHITECTURE.md` (409 L; §1 row `:39`, §5 `:117`, §6.2 `:186-196`, §8.7 `:282-294`, §8.8 `:296-299`, §10 `:341-356`, §11 `:358-367`, §13 `:404-406`), `README.md` (122 L; config `:71-85`, CLI `:87-97`, docs `:99-105`), `docs/FIRE_TEST.md:51` |
-| Repo ADRs | `docs/adr/adr-*.md` — 16 files, one paragraph each, listing the problem each decision solved (see §3.9) |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Artifact types (`plugins/software-factory/src/core/artifacts.ts`)
-
-```ts
-// :301-321
-type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-type ConcernSeverity = "low" | "medium" | "high";
-type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
-  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }
-
-// :323-327
-interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }
-
-// :329-384
-interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
-interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string }
-interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string }
-interface ConcernSource { record: string; agent: string; epic?: string; step?: string;
-  item?: string; iteration?: number; escalated?: boolean; lastSeen?: string }
-interface PendingConcernResolution { action: "resolve"|"carry"|"propagate"|"dismiss"; note?: string; by: string; at: string }
-interface StoredConcernArtifact extends Concern { id: string; status: ConcernStatus;
-  disposition?: ReviewDisposition; dismissReason?: string; source: ConcernSource;
-  pendingResolution?: PendingConcernResolution; createdAt: string; updatedAt: string }
-
-// :386-412
-type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
-interface ReviewSuggestion { id; disposition: ReviewDisposition | string; summary; detail?; location? }
-interface ReviewArtifact { status; summary; suggestions: ReviewSuggestion[];
-  newConcerns?: Concern[]; remarkable?: RemarkableDecision[] }
-
-// :564-583
-interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number }
-interface StateArtifact { …, concerns: ConcernCounts, debt?: string[], … }
-
-// :124-131 (PipelineConfig)
-humanInvolvement?: "autonomous" | "principal" | "detailed";
-concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
-```
-
-### 2.2 Store API (`src/core/concerns.ts`)
-
-```ts
-type ConcernInput = Pick<Concern, "kind"|"summary"|"location"|"affects"> & Partial<Pick<Concern,"detail"|"severity">>;   // :11-12
-concernFingerprint(c: ConcernInput): string                      // :58-60  → c-<10 hex>
-aggregateConcerns(ctx, concerns, remarkables = [], opts): Promise<StoredConcernArtifact[]> // :122-166
-listConcerns(taskDir)                                            // :169-182
-listOpenConcerns(taskDir)                                        // :185-187
-countConcerns(taskDir): Promise<ConcernCounts>                   // :194-215
-listConcernIds(taskDir): Promise<string[]>                       // :218-228
-applyConcernTriage({suggestions, isTriager, …})                  // :250-261
-applyCloseupResolutions({resolutions, by, …})                    // :264-271
-applyConcernConfirms({confirms, …})                              // :280-304
-applyConcernResolution({resolution, by, …})                      // :311-326
-applyWaveCloseupFallback({ids, …})                               // :335-351
-partitionSuggestions(suggestions, concernIds)                    // :354-362
-reconcileConcerns({taskDir, taskWt, repo})                       // :389-406
-```
-
-### 2.3 Triage/routing API (`src/core/triage.ts`, `src/core/review-policy.ts`)
-
-```ts
-partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition   // :35-50
-concernMailboxId(concernId): string            // :52-54 → `q-concern-${id}`
-resolveConcernSeverityPolicy(concerns?)        // :67-75  (defaults medium/high)
-routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>  // :93-136
-isDebtConcern({kind,status,disposition}): boolean                               // :143-149
-listHydratedConcerns(taskDir, consumer): Promise<Record<string, unknown>[]>     // :219-231
-hydrateStepConcerns(taskDir, {stepRole, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
-renderConcernsYaml(records, maxBytes = 8000): string                            // :254-286
-applyReviewTriage(ctx): Promise<ReviewTriageOutcome>                            // :293-349
-
-isTriagerAgent(agent): boolean                 // review-policy.ts:18-20 (reviewer | plan-reviewer)
-resolveReviewAllowed(pipeline, agent, isTriager): string[]  // :27-43 (adds `dismiss` only for triagers)
-```
-
-### 2.4 Funnel / ADR / derivation API
-
-```ts
-persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})   // flows/adrs.ts:46-71
-blockingAdrDisposition(mode): "human-stop" | "human-async" // :14-18
-propagateEpicConcerns({childTaskDir, parentTaskDir, parentWt, epic, concernIds?}) // flows/epic-propagation.ts:152-185
-collectRoutedBlockers(taskDir, minBlockingSeverity = "high"): Promise<Set<string>> // derive/task.ts:52-65
-blockedByConcern(items, concernBlocked): string[]          // plan/scheduler.ts:60-90
-formatHumanInvolvementCriteria(criteria, mode)             // prompts.ts:68-84
-formatDispositionsSection(criteria, allowed)                // prompts.ts:90-110
-```
-
----
-
-## 3. Relevant Excerpts & Semantics
-
-### 3.1 Store identity, dedup and merge (spec 91)
-
-- Fingerprint = `sha256(JSON.stringify([kind, normalized summary, location.file, location.line])).slice(0,10)` with prefix `c-` (`concerns.ts:51-60`). `affects`, `detail`, and `severity` are **not** part of identity; affects are unioned on merge (`:50`, `:76-78`) — the fix captured by `docs/adr/adr-fingerprint-affects-union.md`.
-- Remarkable id = `rm-<10 hex>` over normalized `chosen` + sorted `alternatives` (`concerns.ts:53`, `:89-97`).
-- Merge rules (`concerns.ts:69-97`): keeps the **longer** detail, the **max** severity, preserves the existing kind/summary/status, unions affects, tracks `source.lastSeen`; a severity increase on an already-dismissed concern sets `source.escalated: true` (`:74`) so the dismissal still surfaces as a digest (`triage.ts:103-119`).
-- Files land in `{taskDir}/concerns/<id>.yaml`, written under a per-task keyed mutex and committed immediately unless `commit:false` (`concerns.ts:121-166`). `taskDir` is the task-branch path (`engine.ts:337`) — rationale in `docs/adr/adr-concern-store-taskwt.md`.
-- Legacy migration: a pre-union fingerprint file matching kind+summary+location is rename-merged when the new payload carries a detail (`concerns.ts:99-119`, `:139-147`).
-- Startup reconcile rebuilds missing concern files from committed step records, idempotently (`concerns.ts:389-406`; engine `:383-394`); the store is committed before stray-dirt repair so it is never stashed (`engine.ts:342-347`).
-
-### 3.2 Per-step ingest order (`src/core/flows/step-runner.ts:194-322`)
-
-1. Collect `concerns`, `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` from the validated output (`:199-204`).
-2. Gate by `concerns.raiseAllowlist` on `source.agent` (never the step fragment); a skip keeps the step `ok` and only journals `concern_ingest_skipped` (`:217-231`).
-3. Compute `existing` = concern filenames that existed **before** this step, so a step can never triage/dismiss its own new concerns (`:233-240`).
-4. Pre-flight accepted `dismiss` proposals require a note, before any mutation (`:242-259`).
-5. `aggregateConcerns` (`:260`).
-6. `applyReviewTriage` with `isTriagerAgent(agent)` and severity policy (`:261-275`).
-7. `applyCloseupResolutions` for `concernResolutions` (`:276`).
-8. Decision-level `concernResolution` only honored for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journaled as `concern_resolution_ignored` (`:278-301`).
-9. Architect `concernConfirms` apply pending proposals; accepted `propagate` proposals push to the parent (epic/saga) store (`:303-316`).
-10. Wave close-up fallback for concerns predating the step (`:318-321`).
-
-### 3.3 Triage + `dismiss` (spec 92)
-
-- Only `reviewer` and `plan-reviewer` are triagers (`review-policy.ts:18-20`); close-ups are deliberately **not** triagers — rationale `docs/adr/adr-closeup-no-suggestions-triage.md`.
-- Triage happens through `suggestions[]` whose `id` equals a stored concern/remarkable id; partition is exact-id only, so ordinary findings pass through unchanged (`triage.ts:35-50`).
-- `dismiss` requires non-empty `detail` (the reason); enforced twice — in `applyReviewTriage` before mutation (`triage.ts:305-311`) and in `applyConcernTriage` (`concerns.ts:255`). Dismissed records keep `status: dismissed`, `disposition: dismiss`, `dismissReason` and stay in `concerns/` (`concerns.ts:256-258`).
-- Non-dismiss triage sets `status: routed` + `disposition` (`concerns.ts:256-258`).
-- Allowed-disposition resolution: per-agent list > `reviewPolicy.default` > legacy `allowedDispositions` > builtin `[fix, optional, architect, human-awareness, human-async]`; `dismiss` is appended for triagers and stripped for everyone else (`review-policy.ts:4-43`).
-- The same allowed set drives the generated review schema enum (`src/core/records/review-schema.ts:5-48`, resolved at `step-runner.ts:409-416`).
-- Item-level review wiring: `dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed)` (`item-machine.ts:649`); plan review does the same for `plan-reviewer` (`iteration.ts:537-544`).
-
-### 3.4 Human routing: blocking vs digest (spec 93, 98)
-
-`routeHumanDisposition` (`triage.ts:93-136`) is the single router:
-
-- Applies to dispositions `human-awareness|human-async|human-stop`, routed remarkables (`rm-*`), and dismissed-but-escalated concerns.
-- `digestOnly` = remarkable OR dismissed-escalated OR `human-awareness`. Blocking requires severity ≥ `minBlockingSeverity` (default `high`); below it `human-async`/`human-stop` downgrade to `human-awareness` (a downgraded `stop` loses the exit-10 halt).
-- Nothing is surfaced below `minDigestSeverity` (default `medium`) except `rm-*`, which is exempt from both thresholds.
-- Ids: `q-concern-<concernId>` (or `q-escalated-<concernId>` for a dismissed escalated concern); `blocks` = `[item?, "task"]` for `human-stop`, `[item ?? "task"]` for `human-async`, `[]` for digests (`:117-134`).
-- Mailbox writes are idempotent and never clobber an answered question (`steer.ts:95-106`).
-- Raw item-review human dispositions are suppressed when the suggestion id is a concern id, so the router is the only writer (`item-machine.ts:663-665`, `:714-744`).
-
-### 3.5 Routing effects (spec 93)
-
-| Route | Implementation | Tests |
-|---|---|---|
-| blocker → dependent items blocked + architect consult | `derive/task.ts:52-65` selects kind `blocker` + `status routed` + severity ≥ threshold; `blockedByConcern` computes the transitive fixpoint (`plan/scheduler.ts:60-90`); mapped in `derive/task.ts:174-190`, `derive/item.ts:59-90`, `derive/wave.ts:27-73`; consult per routed blocker before a wave starts and after each act pass (`iteration.ts:179-229`, `:830-856`, `:927-931`), idempotent via the decision artifact | `test/engine/routing-blocker-derive.test.ts:161-415`, `test/engine/routing-architect-consult.test.ts:344-395` |
-| `architect` → next architect turn | routed concerns are hydrated into architect consumers (`triage.ts:219-231`, `includeRouted` for architect); a decision may `resolve`/`carry` (`concerns.ts:311-326`) | `test/engine/routing-architect-consult.test.ts`, `test/engine/closeup-lifecycle-resolve.test.ts:404-528` |
-| `human-*` → mailbox per policy | `triage.ts:93-136`; mode only chooses `human-stop` vs `human-async` for blocking ADRs (`flows/adrs.ts:14-18`) | `test/engine/human-router-severity.test.ts:197-989`, `test/engine/routing-human-debt.test.ts:90-189` |
-| tech debt → plan debt list | `isDebtConcern` = non-open `tech-debt` concern or `optional` disposition, explicitly no `tech-debt` disposition (`triage.ts:138-149`); merged into `debt` (`derive/task.ts:245-250`) and fed to the architect/close-ups | `test/engine/plan-reviewer-triage.test.ts:436`, `test/engine/closeup-lifecycle-resolve.test.ts:528` |
-
-### 3.6 Hydration and the funnel text budget (spec 97)
-
-- Terse record shape drops `detail` (`triage.ts:152-165`); consumers differ: `closeup`/`architect` also see `routed`; only `architect` sees dismissed-escalated (`:219-231`).
-- Caps are `min(code size, 2000)` for review/qa, `min(task diff, 2000)` for wave/plan close-up, `min(prompt input, 500)` otherwise (`triage.ts:234-247`, wired at `step-runner.ts:429-448`).
-- `renderConcernsYaml` degrades progressively: drop `affects`, then shrink summaries (80→1 chars), then shed trailing records; empty string when nothing fits (`triage.ts:254-286`).
-- Epic→saga push condenses: verbatim up to 120 bytes, otherwise halved under a 500-byte cap; summaries prefixed `[epic]` (`epic-propagation.ts:35-36`, `:52-58`, `:141-150`).
-- Tests: `test/engine/funnel-text-budget.test.ts:242-482` (UTF-8 byte counting, caps, “always forwards fewer bytes”, prompt vars must be capped before render).
-
-### 3.7 Close-up lifecycle (spec 94)
-
-- Wave/plan close-ups emit `concernResolutions` (`resolve|carry|propagate|dismiss`) and `concernConfirms`-consuming pending proposals; `applyCloseupResolutions` only records `pendingResolution` — status changes on architect confirmation (`concerns.ts:263-304`).
-- Accept applies: resolve → `resolved`; carry → `routed` with disposition `architect`; dismiss → `dismissed` + reason from the pending note; propagate → proposal cleared and a copy pushed to the parent store (`concerns.ts:280-316`, `step-runner.ts:303-341`).
-- Wave fallback: open tech debt → `optional`, assumptions/risks/questions → `architect`, blockers stay open, never assigns `human-*` (`concerns.ts:328-351`).
-- Close-up prompts bind both `humanInvolvementCriteria` and `concernsYaml` (`agents/steps/wave-close-up.md:20-30`, `agents/steps/plan-close-up.md:20-28`).
-- Tests: `test/engine/closeup-lifecycle-resolve.test.ts` (accept/reject, error when a dismiss note is missing, consult resolve unblocks the item, fallback debt).
-
-### 3.8 Blocking vs remarkable ADRs (spec 98)
-
-- `PlanAdr` has `blocking?: boolean` with the mode-dependent description (`config/schemas/plan.schema.json:120-134`).
-- `persistAdrs` writes full markdown when `project.adrFolder` is set (`config/project.template.yaml:11` → `docs/adr`) and **always** routes to the mailbox: blocking → `human-stop` (autonomous) or `human-async` (principal/detailed) with `blocks: ["task"]`; remarkable → `human-awareness`, no blocks (`flows/adrs.ts:14-71`).
-- Called on plan write and again on revise (idempotent) — `iteration.ts:441-451`, `:614-623`; a blocking ADR parks the task before waves (`iteration.ts:469-478`).
-- Tests: `test/engine/adr-blocking-digest.test.ts:69-390`.
-
-### 3.9 Human-involvement modes (spec 99-103)
-
-- Config: top-level `humanInvolvement` + `concerns` thresholds/allowlist in `pipeline.schema.json:203-229` and `PipelineConfig` (`artifacts.ts:124-131`).
-- Default `config/pipeline.default.yaml:378-432` ships: active `autonomous`, an 8-agent raise allowlist, `minDigestSeverity: medium`, `minBlockingSeverity: high`, three fully commented presets (`autonomous|principal|detailed`), and the ADR/concern blocking table.
-- Prompt fragment `agents/criteria/human-involvement.md` holds the shared table plus one section per mode; `formatHumanInvolvementCriteria` keeps the shared sections and only the active `## <mode>` (`prompts.ts:61-84`).
-- Per-task selectability is plain config layering (`config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml`), covered by `test/human-involvement-config.test.ts:150-476`.
-
-### 3.10 Surfacing (spec 94)
-
-- `state.yaml`: required `concerns` object `{open,dismissed,routed,resolved}` (`state.schema.json:72-100`, `StateArtifact` `artifacts.ts:564-583`), computed by `countConcerns` (missing dir → zeros; corrupt entry → warn + skip) and attached in `deriveTaskState` (`derive/task.ts:369-385`).
-- `factory status`: prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open operator questions into **Blocking** and **Digest** and lists recorded debt (`cli/status.ts:106-124`).
-- Architect hydration for routed items goes through `concernsYaml` only (`iteration.ts:170-177`).
-- Tests: `test/engine/state-concern-counts.test.ts:30-120`, `test/cli/status-concerns.test.ts:39-140`.
-
-### 3.11 Repository ADRs written so far (`docs/adr/`)
-
-These are the architect's own one-paragraph decisions from earlier iterations; they should be respected, and two of them are explicitly **documentation** obligations:
-
-| ADR | Decision / deviation |
-|---|---|
-| `adr-concern-store-taskwt.md` | Aggregate concerns directly to `taskWt/concerns/` because item steps only commit the child worktree; precedent is `writeQuestion`/`refreshStateYaml` |
-| `adr-triage-suggestions-dismiss.md` | Triage via `suggestions[]` with `id = concernId` plus `dismiss` (rejected a separate `concernTriage[]`) |
-| `adr-human-router-single.md` | One router for all human dispositions; digest entries for awareness/remarkable; kills item-machine double-writes |
-| `adr-severity-policy-active.md` | `raiseAllowlist` + digest/blocking thresholds are active semantics |
-| `adr-routing-derived-state.md` | Concerns are file-authoritative; routing effects are derived, never forked |
-| `adr-fingerprint-affects-union.md` | Fingerprint excludes `affects`; merge unions them |
-| `adr-hydration-single-cap.md` | Single hydration module with step-role byte caps, UTF-8 counting |
-| `adr-funnel-text-budget.md` | Prompt condensing + hydration cap enforce “less detail per level” |
-| `adr-epic-push-condensed.md` | Epic→saga push with condensed `[epic]` copies |
-| `adr-digest-mailbox.md` | Digest reuses `tousertoreview` with non-blocking semantics |
-| `adr-closeup-lifecycle-resolved.md` | Close-up propose/confirm lifecycle makes `resolved` reachable and unblocks items |
-| `adr-closeup-no-suggestions-triage.md` | Close-ups removed from the triager set; re-triage via resolutions + confirms + fallback |
-| `adr-humaninvolvement-config.md` | Top-level `humanInvolvement` mode + criteria fragment |
-| `adr-prompt-fragment-matrix.md` | Full fragment matrix with raise instructions and preflight checks |
-| `adr-autonomous-immediate-halt.md` | **Deviation**: autonomous halts immediately at plan time instead of deferring until unblocked work drains |
-| `adr-epic-config-root-only.md` | **Deviation**: epic child tasks do not inherit the parent task's `pipeline.yaml`, so root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics |
-
----
-
-## 4. Requirement → Implementation Evidence (spec `docs/factory.v2.md:89-103`)
-
-| Spec bullet | Evidence | Status |
-|---|---|---|
-| `concerns[]` `{kind,summary,detail,location,severity,affects}` in every agent output (`:90`) | `artifacts.ts:301-321`; schemas developer-output `:61-83`, fact-finder `:22-40`, plan `:135-158`, decisions `:48-72`, review `newConcerns` `:59-99`, wave-closeup `:35-58`, plan-closeup `:27-50`; contracts test `test/contracts/concern-schemas.test.ts:154-723` | implemented |
-| Engine aggregation in `concerns/`, stable fingerprint id, dedup across steps/attempts, status, source record (`:91`) | `concerns.ts:46-166`, `:389-406`; `engine.ts:342-347`, `:383-394`; tests `concerns-funnel.test.ts:320-396`, `:787-844`, `:1130-1262` | implemented |
-| Reviewer triage with disposition vocabulary + `dismiss` (logged with reason, kept) (`:92`) | `review-policy.ts:18-43`, `triage.ts:293-349`, `concerns.ts:250-261`; prompts `steps/review.md:20-24`, `steps/plan-review.md:23`; tests `reviewer-triage.test.ts:287-528`, `plan-reviewer-triage.test.ts:151-435` | implemented |
-| Routing blocker / architect / human-* / tech-debt (`:93`) | `derive/task.ts:52-65`, `plan/scheduler.ts:60-90`, `iteration.ts:179-229`, `triage.ts:93-149`, `derive/task.ts:245-250`; tests `routing-*.test.ts` (4 files), `human-router-severity.test.ts` | implemented |
-| Close-ups list open concerns, re-triage, architect resolves/carries; status/state counts (`:94`) | close-up prompts bind `concernsYaml`; `concerns.ts:263-351`; `state.schema.json:72-100`; `cli/status.ts:106-124`; tests `closeup-lifecycle-resolve`, `state-concern-counts`, `status-concerns` | implemented |
-| Configurable raise allowlist / allowed dispositions / severity thresholds (`:95`) | `pipeline.schema.json:203-229`, `artifacts.ts:124-131`, `step-runner.ts:217-231`, `triage.ts:56-75`, `review-policy.ts:27-43`; `test/human-involvement-config.test.ts` | implemented |
-| Remarkable decisions/tradeoffs with same aggregation/triage (`:96`) | `artifacts.ts:323-327`, `concerns.ts:53`, `:89-97`, `triage.ts:98-119`, `:200-218`; tests `concerns-funnel.test.ts:713-767`, `human-router-severity.test.ts:275-307` | implemented |
-| Funnel worker → reviewer → epic architect → saga architect → human, less detail each level, never more text than the code (`:97`) | item review triage → architect hydration (`triage.ts:219-247`) → epic push (`epic-propagation.ts:141-185`, `engine.ts:266-289`) → human router (`triage.ts:93-136`); `test/engine/funnel-text-budget.test.ts:242-482`, `epic-saga-propagate.test.ts:192-500` | implemented (see Q5/Q6) |
-| Blocking vs non-blocking ADRs; remarkable in digest, never waits (`:98`) | `flows/adrs.ts:14-71`, `iteration.ts:441-451`/`:614-623`; `test/engine/adr-blocking-digest.test.ts:286-390` | implemented |
-| Human modes `autonomous|principal|detailed` as config presets + prompt fragments, per-task selectable (`:99-103`) | `config/pipeline.default.yaml:378-432`, `agents/criteria/human-involvement.md`, `prompts.ts:61-84`, `human-involvement-config.test.ts:150-476` | implemented, with two documented deviations (Q2, Q3) |
-| ARCHITECTURE / README / config commentary update | config commentary done (`pipeline.default.yaml:359-432`); ARCHITECTURE and README **not** updated | **open** |
-| Terse, debloated prompts | every agent/step fragment is 33–46 lines; `test/prompts.test.ts:401-520` enforces ≤15 non-empty added lines per fragment and total ≤80 | implemented |
-
----
-
-## 5. Existing Tests & Conventions
-
-### 5.1 Conventions
-
-- Runner: `bun test` from `plugins/software-factory` (`package.json` scripts: `test`, `typecheck`). Behavior-only tests; no lint/format assertions (per spec item 15).
-- Harness: `FakeHarness` replays scripted outcomes by step label (`src/harness/fake/fake-harness.ts`), so tests exercise the real `runAgentStep`/`runTask` paths.
-- Repos: `test/helpers/tmp-repo.ts:32-134` creates a temp git repo on `main` with deterministic env, plus worktree/branch helpers and `cleanup()`.
-- Assertions are on-disk facts: read `concerns/*.yaml`, `steer/tousertoreview/*.yaml`, `state.yaml`; commits are verified with `git cat-file -e HEAD:<path>` (e.g. `test/engine/concerns-funnel.test.ts:388-395`), not by trusting in-memory results.
-- Test files carry a doc comment naming the spec §/ADR they lock (e.g. `concerns-funnel.test.ts:29-36`, `funnel-text-budget.test.ts:242`, `epic-saga-propagate.test.ts:23`).
-
-### 5.2 Concern-related suites (all green)
-
-| File | Locks | Notable lines |
-|---|---|---|
-| `test/engine/concerns-funnel.test.ts` (1287 L) | schema write gate, store identity/merge, concurrency, reviewer wiring, producer matrix, reconcile, failure journaling | `:37`, `:124`, `:194`, `:320`, `:347`, `:398`, `:467`, `:845`, `:895`, `:935`, `:980`, `:1130`, `:1263` |
-| `test/engine/reviewer-triage.test.ts` (699 L) | terse hydration, exact-id partition, byte caps, dismiss with reason, routed persistence, `fixRequired`, deduped mailbox, non-triager no-op, engine-flow blocking | `:39`, `:166`, `:197`, `:230`, `:287`, `:323`, `:371`, `:410`, `:454`, `:499`, `:530` |
-| `test/engine/plan-reviewer-triage.test.ts` (513 L) | plan-review hydration, architect-revise concerns, triage ids excluded from the plan fix loop, debt derivation | `:28`, `:151`, `:245`, `:368`, `:436` |
-| `test/engine/funnel-text-budget.test.ts` (482 L) | UTF-8 byte counting, truncation at code-point boundary, all hydration caps, “always fewer bytes”, detail condensing, verbatim prompt vars | `:242-482` |
-| `test/engine/human-router-severity.test.ts` (1023 L) | plan-reviewer stop, close-up async, architect hydration of routed, remarkable digests, escalated dismissal, threshold suppression/downgrade, allowlist skip, exit 10 / park / downgrade flows | `:197-989` |
-| `test/engine/routing-blocker-derive.test.ts` (439 L) | `collectRoutedBlockers`, dependency cascade, terminal/running immunity, task-blocked derivation | `:161-415` |
-| `test/engine/routing-architect-consult.test.ts` (444 L) | one decision file, architect hydration, restart idempotency | `:344`, `:395` |
-| `test/engine/routing-human-debt.test.ts` (523 L) | item blocking vs task continuation per disposition, halt/exit 10, digest-only | `:90`, `:143`, `:189` |
-| `test/engine/closeup-lifecycle-resolve.test.ts` (≈660 L) | accept/reject proposals, missing dismiss note error, consult resolve unblocks, fallback debt, blockers stay open | `:281-598` |
-| `test/engine/epic-saga-propagate.test.ts` | `[epic]` copies of open/routed concerns, dismissed stays local, remarkables, saga-architect hydration, deployed child dirs | `:192-660` |
-| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder` | `:69-390` |
-| `test/engine/state-concern-counts.test.ts` | state counts incl. zeroes and corrupt-skip | `:30-120` |
-| `test/cli/status-concerns.test.ts` | counts line, blocking vs digest split, zero state | `:39-140` |
-| `test/human-involvement-config.test.ts` | defaults, layering, `null` deletion, schema closure, commented presets, criteria fragment selection, prompt-var registration | `:150-476` |
-| `test/contracts/concern-artifact-types.test.ts` (≈500 L) | type-level shape of concerns, lifecycle metadata, `dismiss`, ADR blocking flag, pipeline config, producer typing | `:122`, `:213`, `:242`, `:276`, `:336`, `:434` |
-| `test/contracts/concern-schemas.test.ts` (723 L) | inlined concern defs in every producer schema, `newConcerns`, close-up resolutions, untouched triage/infra/edit schemas, confirmations | `:154-632` |
-| `test/contracts/state-concern-schema.test.ts` | state schema requires all four counts | `:12-36` |
-| `test/prompts.test.ts:401-520` | fragment matrix + prompt-debloat budgets + mode switching inside rendered prompts | `:410`, `:434`, `:464`, `:495`, `:517` |
-
----
-
-## 6. Documentation Gaps (concrete, cited)
-
-These are the parts of the intent not yet satisfied. Every item below is a **documentation** change, not behavior.
-
-| # | Target | Current state | Needed |
-|---|---|---|---|
-| D1 | `plugins/software-factory/docs/ARCHITECTURE.md:39` (§1 row 18) | "**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only." | Mark as implemented; point at the concern store, triage/routing, funnel, ADR modes and the new section; keep the two deviations visible |
-| D2 | ARCHITECTURE body | Only two mentions of “concern” in the whole file (`:39`, `:348`); no section on the concern store/triage/routing/funnel/human modes | Add a section (natural slots: new `### 8.11 Concerns & remarkable decisions funnel (§18)` after §8.10, or a top-level `## 15`); include the status vocabulary, fingerprint/dedup, triage rules, routing table, byte caps, ADR blocking table |
-| D3 | ARCHITECTURE `:282-294` (§8.7 dispositions) | Table lists 6 dispositions; `dismiss` is missing; the note only says the enum is generated from the allowed set | Add the `dismiss` row (triager-only, requires `detail`, kept as `dismissed` with reason) |
-| D4 | ARCHITECTURE `:117` (§5) | "pipeline layers … (epics inherit parent task layer)" — contradicted by `src/cli/run.ts:127-139` + `src/core/engine.ts:247` (only the child task dir's `pipeline.yaml` is loaded); recorded in `docs/adr/adr-epic-config-root-only.md` | Correct the claim and state the deviation (root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics) |
-| D5 | ARCHITECTURE `:186-196` (§6.2 task folder) | Listing omits `concerns/` | Add `concerns/{c-*,rm-*}.yaml` and note the store is engine-owned (committed before stray-dirt repair, `engine.ts:342-347`) |
-| D6 | ARCHITECTURE `:341-356` (§10 agents) | Output column only says `developer … concerns[]` | Reflect `newConcerns`/`remarkable` on review outputs and `concerns`/`remarkable`/`concernConfirms`/`concernResolution` on architect decisions, close-ups, plan |
-| D7 | ARCHITECTURE `:358-367` (§11 CLI) | `status` described as "tree, items, waves, budgets, open tousertoreview" | Mention concern counts and the blocking/digest split (`cli/status.ts:106-124`) |
-| D8 | ARCHITECTURE `:404-406` (§13 testing) | Lists dispositions but not the funnel suite | Add concern funnel coverage (store, triage, routing, funnel budget, ADRs, modes) |
-| D9 | `plugins/software-factory/README.md` | **Zero** mentions of concerns, ADRs or human-involvement modes (grep over the whole file) | Add a short section (e.g. under §3 Configuration) covering `humanInvolvement`, `concerns.*`, `reviewPolicy` + triager `dismiss`, and what `factory status` shows; update §5 docs to the new ARCHITECTURE section range (`README.md:99-105` currently says "§0–§14") |
-| D10 | `plugins/software-factory/agents/criteria/dispositions.md:1-20` | Table lacks `dismiss`; step prompts explain it ad hoc (`agents/steps/review.md:22-23`, `agents/steps/plan-review.md:23`) | Add a `dismiss` row (triager-only, reason required, kept on disk) — or deliberately document that `dismiss` lives only in step prompts |
-| D11 | `plugins/software-factory/config/pipeline.default.yaml:359-376` | `reviewPolicy` commentary lists 6 dispositions, no `dismiss`; §18 block (`:378-432`) is already complete | Mention that triagers get `dismiss` appended automatically (`review-policy.ts:36-42`) and why `human-stop` is absent from the default policy |
-
----
-
-## 7. Open Questions & Uncertainties (for the architect)
-
-**Q1 — Is the remaining scope purely documentation?** Functionally every spec bullet has an implementation and at least one behavior test (§4). The only unticked intent item is the doc set in §6. If the architect agrees, the iteration should be a small doc milestone (D1–D11) plus verification of the two deviations, not a re-implementation.
-
-**Q2 — Autonomous mode deviation: document or implement drain scheduling?** Spec (`docs/factory.v2.md:100`) says the human is consulted "only for the portion still blocked after everything unblocked is done". Implementation routes blocking ADRs at plan time and halts immediately (`flows/adrs.ts:14-18`, `iteration.ts:469-478`); `docs/adr/adr-autonomous-immediate-halt.md` accepts this as out of scope. Decide whether the doc records it as a deviation (recommended by the existing ADR) or the iteration implements deferred halting.
-
-**Q3 — Epic config inheritance deviation: document or implement?** Root-task `pipeline.yaml` overrides (`humanInvolvement`, `concerns`, `reviewPolicy`) do not reach epic child tasks: `src/cli/run.ts:127-139` loads only `{taskDir}/pipeline.yaml`, and `engine.ts:234-247` passes the child dir. `docs/adr/adr-epic-config-root-only.md` flags this and says implementing inheritance would change config semantics for all tasks. ARCHITECTURE `:117` currently makes the incorrect claim (see D4).
-
-**Q4 — Who triages architect output outside the plan?** Only `plan-review` routes through `plan-reviewer`; architect concerns raised in `architect-consult-item`, `architect-consult-nonitem`, `architect-wave-report` and `architect-closeup` are aggregated (`step-runner.ts:260`) but `isTriagerAgent` is true for `reviewer|plan-reviewer` only (`review-policy.ts:18-20`), and close-ups are deliberately non-triagers (`docs/adr/adr-closeup-no-suggestions-triage.md`). Those concerns stay `open` until an architect turn hydrates them (`triage.ts:219-231`) or the wave fallback runs. Is that acceptable coverage of the spec sentence "architect output → plan-reviewer", or does a wave-report reviewer step need to exist?
-
-**Q5 — Simple tasks have no reviewer.** `simple-implement` accepts `concernsYaml` (`prompt-vars.ts:69-70`) and the developer allowlist covers it, but the simple flow has no review step, so its concerns are never triaged and the wave fallback never runs (no waves). Recorded in `docs/adr/adr-closeup-lifecycle-resolved.md` ("simple items have no reviewer"). Document as a known limitation or add a triage path?
-
-**Q6 — Remarkables are exempt from both severity thresholds.** `routeHumanDisposition` digests every routed `rm-*` regardless of `minDigestSeverity` (`triage.ts:108-115`), so all remarkable decisions become non-blocking mailbox entries. Spec line 103 demands the mailbox show "only funnelled, confirmed, low-noise items". Is unconditional digest the intended noise level, or should remarkables be gated by confirmation/severity?
-
-**Q7 — `state.yaml` counts exclude remarkable decisions.** `countConcerns` only counts files whose name starts with `c-` (`concerns.ts:204`), while `rm-*` files exist in the same folder and are triageable (`listConcernIds` `:218-228`). Spec says "status/state.yaml shows counts" without defining scope. Decide whether remarkable counts belong in `ConcernCounts`/`state.schema.json:72-100`/`cli/status.ts:106-108`.
-
-**Q8 — Legacy fingerprint migration.** `legacyConcern` (`concerns.ts:99-119`, `:139-147`) rewrites pre-union `c-*` filenames by kind+summary+location when the new payload carries a detail. Is this still needed after the fire test, or is it dead migration weight that the doc should either describe or the iteration should delete?
-
-**Q9 — Allowlist duplication.** `DEFAULT_RAISE_ALLOWLIST` (`concerns.ts:35-44`) mirrors `config/pipeline.default.yaml:393-401` by hand. There is no test asserting the two lists agree; decide whether to generate one from the other or add a contract test.
-
-**Q10 — Mailbox digest growth.** Every routed `human-awareness`/remarkable writes a persistent `q-concern-<id>` entry (`triage.ts:117-134`) that `factory status` prints under "Digest Questions" (`cli/status.ts:114-116`). Ids dedupe and answered entries are never clobbered (`steer.ts:95-106`), but there is no aging/archival rule. Is unbounded digest growth acceptable, or should the doc define a retention rule?
-
-**Q11 — Concern store ownership vs stray-dirt repair.** The engine commits `{task}/concerns` before repair (`engine.ts:342-347`) and reconciles from records (`:383-394`), but ARCHITECTURE §6.3.6 (`:205`) does not list `concerns/` among engine-owned paths. Confirm the intended wording when updating D5/D2.
-
-**Q12 — Documented-vs-tested byte caps.** `funnel-text-budget.test.ts` locks caps (2000/2000/500) as behavior; the numbers live only in `triage.ts:239-243` and the tests. If the architect documents them (D2), note they are code constants, not config.
-
----
-
-## 8. Sources
-
-- Spec: `docs/factory.v2.md:89-103` (item 18), `:104-112` (item 19/20 context), `:76-88` (items 13–17 context)
-- Architecture: `plugins/software-factory/docs/ARCHITECTURE.md:39`, `:112-119`, `:179-209`, `:220-318`, `:339-367`, `:404-409`
-- README: `plugins/software-factory/README.md:71-105`
-- Fire test: `plugins/software-factory/docs/FIRE_TEST.md:51`
-- Repo ADRs: `docs/adr/adr-*.md` (16 files)
-- Core: `plugins/software-factory/src/core/{concerns,triage,review-policy,artifacts,prompts,prompt-vars,steer}.ts`; `src/core/flows/{step-runner,iteration,item-machine,consults,epic-propagation,adrs}.ts`; `src/core/derive/{task,item,wave}.ts`; `src/core/plan/scheduler.ts`; `src/core/records/review-schema.ts`; `src/core/engine.ts`; `src/cli/{status,run}.ts`
-- Schemas: `plugins/software-factory/config/schemas/{developer-output,fact-finder-output,plan,decisions,review,wave-closeup,plan-closeup,state,pipeline}.schema.json`
-- Config: `plugins/software-factory/config/pipeline.default.yaml:359-456`; `config/project.template.yaml:11`
-- Prompts: `plugins/software-factory/agents/criteria/{human-involvement,dispositions}.md`; `agents/steps/{review,plan-review,qa,develop,fix-round,architect-*}.md`; `agents/architect.md:33`
-- Tests: `plugins/software-factory/test/engine/*concern*`, `reviewer-triage`, `plan-reviewer-triage`, `funnel-text-budget`, `human-router-severity`, `routing-*`, `adr-blocking-digest`, `epic-saga-propagate`, `closeup-lifecycle-resolve`, `state-concern-counts`; `test/cli/status-concerns.test.ts`; `test/human-involvement-config.test.ts`; `test/contracts/*concern*`; `test/prompts.test.ts:401-520`; `test/helpers/tmp-repo.ts``). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-prompts-dismiss-filter
-
-## Assignment
-{"slug":"prompts-dismiss-filter","kind":"dev","title":"Dismiss criteria row + prompt filtering","assignment":"Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.","outlineRef":"prompts-dismiss-filter","milestone":"m1-dismiss-contract","wave":1,"scenarioRefs":["m1-dismiss-contract:s1","m1-dismiss-contract:s2","m1-dismiss-contract:s3","m1-dismiss-contract:s4"],"citations":["docs/factory.v2.md:89-103","plugins/software-factory/src/core/records/review-schema.ts:5-52","plugins/software-factory/src/core/flows/item-machine.ts:628-647"]}
-
-## Prior Attempts & Failures
-2 attempts recorded for develop (all rejected); next would be 3 > max 2
-
-## Current Diff
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/checks.yaml +77/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/input.md +64/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/meta.yaml +19/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/001-test-first-r1-a1/output.yaml +62/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/input.md +72/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/002-develop-r1-a1/meta.yaml +22/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/input.md +78/-0
-.factory/tasks/concerns-funnel/items/prompts-dismiss-filter/steps/003-develop-r1-a2/meta.yaml +22/-0
-plugins/software-factory/agents/criteria/dispositions.md +2/-0
-plugins/software-factory/src/core/prompts.ts +10/-9
-plugins/software-factory/test/prompts.test.ts +92/-6
-
-## Review Feedback
-Output validation and repair failed: Agent output failed schema validation:
-/: must be object ({"type":"object"})
-
-## Context Pack
-# Context Pack — concerns-funnel (Spec Item 18)
-
-## 0. Snapshot (verified 2026-11-09)
-
-| Fact | Evidence |
-|---|---|
-| Task | spec item 18 of `docs/factory.v2.md:89-103` (acceptance definition) |
-| Code state | plugin sources committed at worktree HEAD `b3450c9` (`factory: context-pack-4 a1`); plugin tree clean (only factory journal dirty) |
-| Test health | `cd plugins/software-factory && bun test` → **445 pass, 2 skip, 0 fail**, 2468 expect() calls, 69 files, 105s |
-| Concern-focused subset | 17 files / **137 pass, 0 fail** (concerns-funnel, reviewer-triage, plan-reviewer-triage, funnel-text-budget, human-router-severity, routing-*, state-concern-counts, adr-blocking-digest, epic-saga-propagate, closeup-lifecycle-resolve, human-involvement-config, cli/status-concerns, contracts/*) |
-| Implementation status | item 18 is materially implemented (store, fingerprint/dedup, triage+dismiss, routing, funnel, ADRs, human modes, close-up/status/state surfacing). Docs were **not** updated: `plugins/software-factory/docs/ARCHITECTURE.md:39` still says "Deliberately not hand-built … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only" |
-| Repository ADRs | 16 one-paragraph ADRs written by the architect under `docs/adr/` (project `adrFolder`, `plugins/software-factory/config/project.template.yaml:11`) |
-| Active human mode | default `autonomous`; repo `.factory/pipeline.yaml` absent → only default + repo layers apply |
-
-> Containment note: `.factory/tasks/**` is orchestration state and is intentionally not inspected here; all claims below come from plugin sources, schemas, prompts, docs and tests.
-
----
-
-## 1. Module Map
-
-### 1.1 Core concern subsystem
-
-| File | Responsibility | Key ranges |
-|---|---|---|
-| `plugins/software-factory/src/core/concerns.ts` (406 L) | The concern store: stable fingerprint ids, per-file dedup/merge, aggregation with immediate commit, status vocabulary, triage application, close-up proposals/confirms, decision-level resolution, wave fallback, crash reconcile | `:35-44` allowlist, `:46-60` ids, `:69-97` merge, `:121-166` aggregate, `:184-215` counts, `:250-261` triage, `:263-304` close-up lifecycle, `:311-326` resolution, `:335-351` wave fallback, `:353-362` partition, `:388-406` reconcile |
-| `plugins/software-factory/src/core/triage.ts` (349 L) | Pure triage/routing helpers: partition by exact id, severity policy, single human-disposition router (digest vs blocking), debt predicate, terse hydration + byte-capped rendering, `applyReviewTriage` | `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-149`, `:152-165`, `:200-247`, `:254-286`, `:293-349` |
-| `plugins/software-factory/src/core/review-policy.ts` (43 L) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; appends `dismiss` for triagers only | `:4-20`, `:27-43` |
-| `plugins/software-factory/src/core/flows/step-runner.ts` (923 L) | Post-step ingest: aggregates produced concerns/remarkables, applies triage on pre-existing ids only, records close-up resolutions, honors/ignores decision-level resolutions, applies architect confirms + epic propagation, wave fallback; resolves schema/dispositions and hydrates `concernsYaml` | `:194-322`, `:325-341`, `:409-449` |
-| `plugins/software-factory/src/core/flows/iteration.ts` (1337 L) | Architect plan/revise (ADR persistence), plan-review wiring (plan-reviewer is the triager for architect output), wave-level routed-blocker consults | `:170-177`, `:179-229`, `:441-451`, `:517-549`, `:614-623`, `:810-933` |
-| `plugins/software-factory/src/core/flows/item-machine.ts` (811 L) | Item review prompt wiring (`dispositionsCriteria`, `reviewAllowed`) and suppression of duplicate raw human dispositions for concern ids | `:663-665`, `:714-744`, `:766-810` |
-| `plugins/software-factory/src/core/flows/consults.ts` (421 L) | `consult-concern-<id>` architect consult for a routed blocker; decision may carry `concernResolution` | `:326-421` |
-| `plugins/software-factory/src/core/flows/epic-propagation.ts` (185 L) | Epic→saga concern push: condensed copies, `[epic]` summaries, forwarded blocked questions | `:17-36`, `:97-129`, `:141-150`, `:152-185` |
-| `plugins/software-factory/src/core/flows/adrs.ts` (72 L) | Blocking vs remarkable ADR: markdown record + mailbox routing under the active mode | `:14-18`, `:20-37`, `:46-71` |
-
-### 1.2 Derivation, engine, CLI
-
-| File | Responsibility | Key ranges |
-|---|---|---|
-| `src/core/derive/task.ts` (441 L) | `collectRoutedBlockers` (kind `blocker` + status `routed` + severity ≥ `minBlockingSeverity`); maps routed blocking onto item state; debt list incl. concern debt; `concerns` counts on state | `:47-65`, `:174-190`, `:219-250`, `:369-385` |
-| `src/core/derive/item.ts` | Applies routed-concern blocking to pending items (`withRoutedBlocking`) | `:59-90` |
-| `src/core/derive/wave.ts` | Wave state carries concern-blocked items; transitive fixpoint over declared deps | `:27`, `:47`, `:73` |
-| `src/core/plan/scheduler.ts` | `blockedByConcern(...)` failure-union fixpoint used by iteration/scheduler | `:60-90` |
-| `src/core/engine.ts` (795 L) | Startup: commit engine-owned concern store (`factory: concern store recovery`), reconcile concerns from committed records; epic child finish: `propagateEpicConcerns` + child-closeup commit | `:266-289`, `:342-347`, `:383-394` |
-| `src/core/prompts.ts` (597 L) | `loadCriteriaBundle`, `formatHumanInvolvementCriteria` (selects `## <mode>` + shared table), `formatDispositionsSection` (allowed set, drops `human-stop` unless allowed) | `:35-59`, `:61-84`, `:86-110` |
-| `src/core/prompt-vars.ts` (171 L) | `KNOWN_VARS` fragment matrix (which steps get `concernsYaml` / `humanInvolvementCriteria`) and var descriptions | `:12-40`, `:46-171` |
-| `src/core/records/review-schema.ts` (104 L) | Generates the review schema with the agent's allowed disposition enum; declares `remarkable` and `newConcerns` | `:5-104` |
-| `src/cli/status.ts` (128 L) | `factory status`: concern counts line + blocking vs digest question split + recorded debt | `:84-124` (counts `:106-108`) |
-| `src/core/steer.ts` (188 L) | Mailbox writer: deterministic id fallback, never clobbers an operator answer | `:63-110` |
-
-### 1.3 Schemas, config, prompts, docs
-
-| Area | Files |
-|---|---|
-| Artifact schemas with `concerns`/`remarkable` | `config/schemas/developer-output.schema.json:61-83`, `fact-finder-output.schema.json:22-40`, `plan.schema.json:120-158`, `decisions.schema.json:48-95` (+`concernConfirms` `:73-83`, `concernResolution` `:84-95`), `review.schema.json:47-99` (`remarkable` 47-58, `newConcerns` 59-99), `wave-closeup.schema.json:35-70`, `plan-closeup.schema.json:27-70` |
-| State/pipeline schemas | `config/schemas/state.schema.json:72-100` (required counts), `pipeline.schema.json:203-229` (`humanInvolvement`, `concerns`) |
-| Config | `config/pipeline.default.yaml:359-376` (reviewPolicy), `:378-432` (§18 block: mode, allowlist, thresholds, commented presets, ADR blocking table), `:434-456` (criteria registry); `config/project.template.yaml:11` (`adrFolder: docs/adr`) |
-| Prompts | `agents/criteria/human-involvement.md` (mode table + per-mode sections), `agents/steps/review.md:15-24`, `agents/steps/plan-review.md:14-37`, `agents/steps/qa.md:30+`, `agents/steps/develop.md:21-22`, `agents/steps/architect-*.md` (all bind `humanInvolvementCriteria`/`concernsYaml`), `agents/architect.md:33` (ADR blocking rule) |
-| Docs | `plugins/software-factory/docs/ARCHITECTURE.md` (409 L; §1 row `:39`, §5 `:117`, §6.2 `:186-196`, §8.7 `:282-294`, §8.8 `:296-299`, §10 `:341-356`, §11 `:358-367`, §13 `:404-406`), `README.md` (122 L; config `:71-85`, CLI `:87-97`, docs `:99-105`), `docs/FIRE_TEST.md:51` |
-| Repo ADRs | `docs/adr/adr-*.md` — 16 files, one paragraph each, listing the problem each decision solved (see §3.9) |
-
----
-
-## 2. Key Interfaces & Signatures
-
-### 2.1 Artifact types (`plugins/software-factory/src/core/artifacts.ts`)
-
-```ts
-// :301-321
-type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
-type ConcernSeverity = "low" | "medium" | "high";
-type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
-interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
-  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }
-
-// :323-327
-interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }
-
-// :329-384
-interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
-interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string }
-interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string }
-interface ConcernSource { record: string; agent: string; epic?: string; step?: string;
-  item?: string; iteration?: number; escalated?: boolean; lastSeen?: string }
-interface PendingConcernResolution { action: "resolve"|"carry"|"propagate"|"dismiss"; note?: string; by: string; at: string }
-interface StoredConcernArtifact extends Concern { id: string; status: ConcernStatus;
-  disposition?: ReviewDisposition; dismissReason?: string; source: ConcernSource;
-  pendingResolution?: PendingConcernResolution; createdAt: string; updatedAt: string }
-
-// :386-412
-type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
-interface ReviewSuggestion { id; disposition: ReviewDisposition | string; summary; detail?; location? }
-interface ReviewArtifact { status; summary; suggestions: ReviewSuggestion[];
-  newConcerns?: Concern[]; remarkable?: RemarkableDecision[] }
-
-// :564-583
-interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number }
-interface StateArtifact { …, concerns: ConcernCounts, debt?: string[], … }
-
-// :124-131 (PipelineConfig)
-humanInvolvement?: "autonomous" | "principal" | "detailed";
-concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
-```
-
-### 2.2 Store API (`src/core/concerns.ts`)
-
-```ts
-type ConcernInput = Pick<Concern, "kind"|"summary"|"location"|"affects"> & Partial<Pick<Concern,"detail"|"severity">>;   // :11-12
-concernFingerprint(c: ConcernInput): string                      // :58-60  → c-<10 hex>
-aggregateConcerns(ctx, concerns, remarkables = [], opts): Promise<StoredConcernArtifact[]> // :122-166
-listConcerns(taskDir)                                            // :169-182
-listOpenConcerns(taskDir)                                        // :185-187
-countConcerns(taskDir): Promise<ConcernCounts>                   // :194-215
-listConcernIds(taskDir): Promise<string[]>                       // :218-228
-applyConcernTriage({suggestions, isTriager, …})                  // :250-261
-applyCloseupResolutions({resolutions, by, …})                    // :264-271
-applyConcernConfirms({confirms, …})                              // :280-304
-applyConcernResolution({resolution, by, …})                      // :311-326
-applyWaveCloseupFallback({ids, …})                               // :335-351
-partitionSuggestions(suggestions, concernIds)                    // :354-362
-reconcileConcerns({taskDir, taskWt, repo})                       // :389-406
-```
-
-### 2.3 Triage/routing API (`src/core/triage.ts`, `src/core/review-policy.ts`)
-
-```ts
-partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition   // :35-50
-concernMailboxId(concernId): string            // :52-54 → `q-concern-${id}`
-resolveConcernSeverityPolicy(concerns?)        // :67-75  (defaults medium/high)
-routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>  // :93-136
-isDebtConcern({kind,status,disposition}): boolean                               // :143-149
-listHydratedConcerns(taskDir, consumer): Promise<Record<string, unknown>[]>     // :219-231
-hydrateStepConcerns(taskDir, {stepRole, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
-renderConcernsYaml(records, maxBytes = 8000): string                            // :254-286
-applyReviewTriage(ctx): Promise<ReviewTriageOutcome>                            // :293-349
-
-isTriagerAgent(agent): boolean                 // review-policy.ts:18-20 (reviewer | plan-reviewer)
-resolveReviewAllowed(pipeline, agent, isTriager): string[]  // :27-43 (adds `dismiss` only for triagers)
-```
-
-### 2.4 Funnel / ADR / derivation API
-
-```ts
-persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})   // flows/adrs.ts:46-71
-blockingAdrDisposition(mode): "human-stop" | "human-async" // :14-18
-propagateEpicConcerns({childTaskDir, parentTaskDir, parentWt, epic, concernIds?}) // flows/epic-propagation.ts:152-185
-collectRoutedBlockers(taskDir, minBlockingSeverity = "high"): Promise<Set<string>> // derive/task.ts:52-65
-blockedByConcern(items, concernBlocked): string[]          // plan/scheduler.ts:60-90
-formatHumanInvolvementCriteria(criteria, mode)             // prompts.ts:68-84
-formatDispositionsSection(criteria, allowed)                // prompts.ts:90-110
-```
-
----
-
-## 3. Relevant Excerpts & Semantics
-
-### 3.1 Store identity, dedup and merge (spec 91)
-
-- Fingerprint = `sha256(JSON.stringify([kind, normalized summary, location.file, location.line])).slice(0,10)` with prefix `c-` (`concerns.ts:51-60`). `affects`, `detail`, and `severity` are **not** part of identity; affects are unioned on merge (`:50`, `:76-78`) — the fix captured by `docs/adr/adr-fingerprint-affects-union.md`.
-- Remarkable id = `rm-<10 hex>` over normalized `chosen` + sorted `alternatives` (`concerns.ts:53`, `:89-97`).
-- Merge rules (`concerns.ts:69-97`): keeps the **longer** detail, the **max** severity, preserves the existing kind/summary/status, unions affects, tracks `source.lastSeen`; a severity increase on an already-dismissed concern sets `source.escalated: true` (`:74`) so the dismissal still surfaces as a digest (`triage.ts:103-119`).
-- Files land in `{taskDir}/concerns/<id>.yaml`, written under a per-task keyed mutex and committed immediately unless `commit:false` (`concerns.ts:121-166`). `taskDir` is the task-branch path (`engine.ts:337`) — rationale in `docs/adr/adr-concern-store-taskwt.md`.
-- Legacy migration: a pre-union fingerprint file matching kind+summary+location is rename-merged when the new payload carries a detail (`concerns.ts:99-119`, `:139-147`).
-- Startup reconcile rebuilds missing concern files from committed step records, idempotently (`concerns.ts:389-406`; engine `:383-394`); the store is committed before stray-dirt repair so it is never stashed (`engine.ts:342-347`).
-
-### 3.2 Per-step ingest order (`src/core/flows/step-runner.ts:194-322`)
-
-1. Collect `concerns`, `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` from the validated output (`:199-204`).
-2. Gate by `concerns.raiseAllowlist` on `source.agent` (never the step fragment); a skip keeps the step `ok` and only journals `concern_ingest_skipped` (`:217-231`).
-3. Compute `existing` = concern filenames that existed **before** this step, so a step can never triage/dismiss its own new concerns (`:233-240`).
-4. Pre-flight accepted `dismiss` proposals require a note, before any mutation (`:242-259`).
-5. `aggregateConcerns` (`:260`).
-6. `applyReviewTriage` with `isTriagerAgent(agent)` and severity policy (`:261-275`).
-7. `applyCloseupResolutions` for `concernResolutions` (`:276`).
-8. Decision-level `concernResolution` only honored for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journaled as `concern_resolution_ignored` (`:278-301`).
-9. Architect `concernConfirms` apply pending proposals; accepted `propagate` proposals push to the parent (epic/saga) store (`:303-316`).
-10. Wave close-up fallback for concerns predating the step (`:318-321`).
-
-### 3.3 Triage + `dismiss` (spec 92)
-
-- Only `reviewer` and `plan-reviewer` are triagers (`review-policy.ts:18-20`); close-ups are deliberately **not** triagers — rationale `docs/adr/adr-closeup-no-suggestions-triage.md`.
-- Triage happens through `suggestions[]` whose `id` equals a stored concern/remarkable id; partition is exact-id only, so ordinary findings pass through unchanged (`triage.ts:35-50`).
-- `dismiss` requires non-empty `detail` (the reason); enforced twice — in `applyReviewTriage` before mutation (`triage.ts:305-311`) and in `applyConcernTriage` (`concerns.ts:255`). Dismissed records keep `status: dismissed`, `disposition: dismiss`, `dismissReason` and stay in `concerns/` (`concerns.ts:256-258`).
-- Non-dismiss triage sets `status: routed` + `disposition` (`concerns.ts:256-258`).
-- Allowed-disposition resolution: per-agent list > `reviewPolicy.default` > legacy `allowedDispositions` > builtin `[fix, optional, architect, human-awareness, human-async]`; `dismiss` is appended for triagers and stripped for everyone else (`review-policy.ts:4-43`).
-- The same allowed set drives the generated review schema enum (`src/core/records/review-schema.ts:5-48`, resolved at `step-runner.ts:409-416`).
-- Item-level review wiring: `dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed)` (`item-machine.ts:649`); plan review does the same for `plan-reviewer` (`iteration.ts:537-544`).
-
-### 3.4 Human routing: blocking vs digest (spec 93, 98)
-
-`routeHumanDisposition` (`triage.ts:93-136`) is the single router:
-
-- Applies to dispositions `human-awareness|human-async|human-stop`, routed remarkables (`rm-*`), and dismissed-but-escalated concerns.
-- `digestOnly` = remarkable OR dismissed-escalated OR `human-awareness`. Blocking requires severity ≥ `minBlockingSeverity` (default `high`); below it `human-async`/`human-stop` downgrade to `human-awareness` (a downgraded `stop` loses the exit-10 halt).
-- Nothing is surfaced below `minDigestSeverity` (default `medium`) except `rm-*`, which is exempt from both thresholds.
-- Ids: `q-concern-<concernId>` (or `q-escalated-<concernId>` for a dismissed escalated concern); `blocks` = `[item?, "task"]` for `human-stop`, `[item ?? "task"]` for `human-async`, `[]` for digests (`:117-134`).
-- Mailbox writes are idempotent and never clobber an answered question (`steer.ts:95-106`).
-- Raw item-review human dispositions are suppressed when the suggestion id is a concern id, so the router is the only writer (`item-machine.ts:663-665`, `:714-744`).
-
-### 3.5 Routing effects (spec 93)
-
-| Route | Implementation | Tests |
-|---|---|---|
-| blocker → dependent items blocked + architect consult | `derive/task.ts:52-65` selects kind `blocker` + `status routed` + severity ≥ threshold; `blockedByConcern` computes the transitive fixpoint (`plan/scheduler.ts:60-90`); mapped in `derive/task.ts:174-190`, `derive/item.ts:59-90`, `derive/wave.ts:27-73`; consult per routed blocker before a wave starts and after each act pass (`iteration.ts:179-229`, `:830-856`, `:927-931`), idempotent via the decision artifact | `test/engine/routing-blocker-derive.test.ts:161-415`, `test/engine/routing-architect-consult.test.ts:344-395` |
-| `architect` → next architect turn | routed concerns are hydrated into architect consumers (`triage.ts:219-231`, `includeRouted` for architect); a decision may `resolve`/`carry` (`concerns.ts:311-326`) | `test/engine/routing-architect-consult.test.ts`, `test/engine/closeup-lifecycle-resolve.test.ts:404-528` |
-| `human-*` → mailbox per policy | `triage.ts:93-136`; mode only chooses `human-stop` vs `human-async` for blocking ADRs (`flows/adrs.ts:14-18`) | `test/engine/human-router-severity.test.ts:197-989`, `test/engine/routing-human-debt.test.ts:90-189` |
-| tech debt → plan debt list | `isDebtConcern` = non-open `tech-debt` concern or `optional` disposition, explicitly no `tech-debt` disposition (`triage.ts:138-149`); merged into `debt` (`derive/task.ts:245-250`) and fed to the architect/close-ups | `test/engine/plan-reviewer-triage.test.ts:436`, `test/engine/closeup-lifecycle-resolve.test.ts:528` |
-
-### 3.6 Hydration and the funnel text budget (spec 97)
-
-- Terse record shape drops `detail` (`triage.ts:152-165`); consumers differ: `closeup`/`architect` also see `routed`; only `architect` sees dismissed-escalated (`:219-231`).
-- Caps are `min(code size, 2000)` for review/qa, `min(task diff, 2000)` for wave/plan close-up, `min(prompt input, 500)` otherwise (`triage.ts:234-247`, wired at `step-runner.ts:429-448`).
-- `renderConcernsYaml` degrades progressively: drop `affects`, then shrink summaries (80→1 chars), then shed trailing records; empty string when nothing fits (`triage.ts:254-286`).
-- Epic→saga push condenses: verbatim up to 120 bytes, otherwise halved under a 500-byte cap; summaries prefixed `[epic]` (`epic-propagation.ts:35-36`, `:52-58`, `:141-150`).
-- Tests: `test/engine/funnel-text-budget.test.ts:242-482` (UTF-8 byte counting, caps, “always forwards fewer bytes”, prompt vars must be capped before render).
-
-### 3.7 Close-up lifecycle (spec 94)
-
-- Wave/plan close-ups emit `concernResolutions` (`resolve|carry|propagate|dismiss`) and `concernConfirms`-consuming pending proposals; `applyCloseupResolutions` only records `pendingResolution` — status changes on architect confirmation (`concerns.ts:263-304`).
-- Accept applies: resolve → `resolved`; carry → `routed` with disposition `architect`; dismiss → `dismissed` + reason from the pending note; propagate → proposal cleared and a copy pushed to the parent store (`concerns.ts:280-316`, `step-runner.ts:303-341`).
-- Wave fallback: open tech debt → `optional`, assumptions/risks/questions → `architect`, blockers stay open, never assigns `human-*` (`concerns.ts:328-351`).
-- Close-up prompts bind both `humanInvolvementCriteria` and `concernsYaml` (`agents/steps/wave-close-up.md:20-30`, `agents/steps/plan-close-up.md:20-28`).
-- Tests: `test/engine/closeup-lifecycle-resolve.test.ts` (accept/reject, error when a dismiss note is missing, consult resolve unblocks the item, fallback debt).
-
-### 3.8 Blocking vs remarkable ADRs (spec 98)
-
-- `PlanAdr` has `blocking?: boolean` with the mode-dependent description (`config/schemas/plan.schema.json:120-134`).
-- `persistAdrs` writes full markdown when `project.adrFolder` is set (`config/project.template.yaml:11` → `docs/adr`) and **always** routes to the mailbox: blocking → `human-stop` (autonomous) or `human-async` (principal/detailed) with `blocks: ["task"]`; remarkable → `human-awareness`, no blocks (`flows/adrs.ts:14-71`).
-- Called on plan write and again on revise (idempotent) — `iteration.ts:441-451`, `:614-623`; a blocking ADR parks the task before waves (`iteration.ts:469-478`).
-- Tests: `test/engine/adr-blocking-digest.test.ts:69-390`.
-
-### 3.9 Human-involvement modes (spec 99-103)
-
-- Config: top-level `humanInvolvement` + `concerns` thresholds/allowlist in `pipeline.schema.json:203-229` and `PipelineConfig` (`artifacts.ts:124-131`).
-- Default `config/pipeline.default.yaml:378-432` ships: active `autonomous`, an 8-agent raise allowlist, `minDigestSeverity: medium`, `minBlockingSeverity: high`, three fully commented presets (`autonomous|principal|detailed`), and the ADR/concern blocking table.
-- Prompt fragment `agents/criteria/human-involvement.md` holds the shared table plus one section per mode; `formatHumanInvolvementCriteria` keeps the shared sections and only the active `## <mode>` (`prompts.ts:61-84`).
-- Per-task selectability is plain config layering (`config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml`), covered by `test/human-involvement-config.test.ts:150-476`.
-
-### 3.10 Surfacing (spec 94)
-
-- `state.yaml`: required `concerns` object `{open,dismissed,routed,resolved}` (`state.schema.json:72-100`, `StateArtifact` `artifacts.ts:564-583`), computed by `countConcerns` (missing dir → zeros; corrupt entry → warn + skip) and attached in `deriveTaskState` (`derive/task.ts:369-385`).
-- `factory status`: prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open operator questions into **Blocking** and **Digest** and lists recorded debt (`cli/status.ts:106-124`).
-- Architect hydration for routed items goes through `concernsYaml` only (`iteration.ts:170-177`).
-- Tests: `test/engine/state-concern-counts.test.ts:30-120`, `test/cli/status-concerns.test.ts:39-140`.
-
-### 3.11 Repository ADRs written so far (`docs/adr/`)
-
-These are the architect's own one-paragraph decisions from earlier iterations; they should be respected, and two of them are explicitly **documentation** obligations:
-
-| ADR | Decision / deviation |
-|---|---|
-| `adr-concern-store-taskwt.md` | Aggregate concerns directly to `taskWt/concerns/` because item steps only commit the child worktree; precedent is `writeQuestion`/`refreshStateYaml` |
-| `adr-triage-suggestions-dismiss.md` | Triage via `suggestions[]` with `id = concernId` plus `dismiss` (rejected a separate `concernTriage[]`) |
-| `adr-human-router-single.md` | One router for all human dispositions; digest entries for awareness/remarkable; kills item-machine double-writes |
-| `adr-severity-policy-active.md` | `raiseAllowlist` + digest/blocking thresholds are active semantics |
-| `adr-routing-derived-state.md` | Concerns are file-authoritative; routing effects are derived, never forked |
-| `adr-fingerprint-affects-union.md` | Fingerprint excludes `affects`; merge unions them |
-| `adr-hydration-single-cap.md` | Single hydration module with step-role byte caps, UTF-8 counting |
-| `adr-funnel-text-budget.md` | Prompt condensing + hydration cap enforce “less detail per level” |
-| `adr-epic-push-condensed.md` | Epic→saga push with condensed `[epic]` copies |
-| `adr-digest-mailbox.md` | Digest reuses `tousertoreview` with non-blocking semantics |
-| `adr-closeup-lifecycle-resolved.md` | Close-up propose/confirm lifecycle makes `resolved` reachable and unblocks items |
-| `adr-closeup-no-suggestions-triage.md` | Close-ups removed from the triager set; re-triage via resolutions + confirms + fallback |
-| `adr-humaninvolvement-config.md` | Top-level `humanInvolvement` mode + criteria fragment |
-| `adr-prompt-fragment-matrix.md` | Full fragment matrix with raise instructions and preflight checks |
-| `adr-autonomous-immediate-halt.md` | **Deviation**: autonomous halts immediately at plan time instead of deferring until unblocked work drains |
-| `adr-epic-config-root-only.md` | **Deviation**: epic child tasks do not inherit the parent task's `pipeline.yaml`, so root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics |
-
----
-
-## 4. Requirement → Implementation Evidence (spec `docs/factory.v2.md:89-103`)
-
-| Spec bullet | Evidence | Status |
-|---|---|---|
-| `concerns[]` `{kind,summary,detail,location,severity,affects}` in every agent output (`:90`) | `artifacts.ts:301-321`; schemas developer-output `:61-83`, fact-finder `:22-40`, plan `:135-158`, decisions `:48-72`, review `newConcerns` `:59-99`, wave-closeup `:35-58`, plan-closeup `:27-50`; contracts test `test/contracts/concern-schemas.test.ts:154-723` | implemented |
-| Engine aggregation in `concerns/`, stable fingerprint id, dedup across steps/attempts, status, source record (`:91`) | `concerns.ts:46-166`, `:389-406`; `engine.ts:342-347`, `:383-394`; tests `concerns-funnel.test.ts:320-396`, `:787-844`, `:1130-1262` | implemented |
-| Reviewer triage with disposition vocabulary + `dismiss` (logged with reason, kept) (`:92`) | `review-policy.ts:18-43`, `triage.ts:293-349`, `concerns.ts:250-261`; prompts `steps/review.md:20-24`, `steps/plan-review.md:23`; tests `reviewer-triage.test.ts:287-528`, `plan-reviewer-triage.test.ts:151-435` | implemented |
-| Routing blocker / architect / human-* / tech-debt (`:93`) | `derive/task.ts:52-65`, `plan/scheduler.ts:60-90`, `iteration.ts:179-229`, `triage.ts:93-149`, `derive/task.ts:245-250`; tests `routing-*.test.ts` (4 files), `human-router-severity.test.ts` | implemented |
-| Close-ups list open concerns, re-triage, architect resolves/carries; status/state counts (`:94`) | close-up prompts bind `concernsYaml`; `concerns.ts:263-351`; `state.schema.json:72-100`; `cli/status.ts:106-124`; tests `closeup-lifecycle-resolve`, `state-concern-counts`, `status-concerns` | implemented |
-| Configurable raise allowlist / allowed dispositions / severity thresholds (`:95`) | `pipeline.schema.json:203-229`, `artifacts.ts:124-131`, `step-runner.ts:217-231`, `triage.ts:56-75`, `review-policy.ts:27-43`; `test/human-involvement-config.test.ts` | implemented |
-| Remarkable decisions/tradeoffs with same aggregation/triage (`:96`) | `artifacts.ts:323-327`, `concerns.ts:53`, `:89-97`, `triage.ts:98-119`, `:200-218`; tests `concerns-funnel.test.ts:713-767`, `human-router-severity.test.ts:275-307` | implemented |
-| Funnel worker → reviewer → epic architect → saga architect → human, less detail each level, never more text than the code (`:97`) | item review triage → architect hydration (`triage.ts:219-247`) → epic push (`epic-propagation.ts:141-185`, `engine.ts:266-289`) → human router (`triage.ts:93-136`); `test/engine/funnel-text-budget.test.ts:242-482`, `epic-saga-propagate.test.ts:192-500` | implemented (see Q5/Q6) |
-| Blocking vs non-blocking ADRs; remarkable in digest, never waits (`:98`) | `flows/adrs.ts:14-71`, `iteration.ts:441-451`/`:614-623`; `test/engine/adr-blocking-digest.test.ts:286-390` | implemented |
-| Human modes `autonomous|principal|detailed` as config presets + prompt fragments, per-task selectable (`:99-103`) | `config/pipeline.default.yaml:378-432`, `agents/criteria/human-involvement.md`, `prompts.ts:61-84`, `human-involvement-config.test.ts:150-476` | implemented, with two documented deviations (Q2, Q3) |
-| ARCHITECTURE / README / config commentary update | config commentary done (`pipeline.default.yaml:359-432`); ARCHITECTURE and README **not** updated | **open** |
-| Terse, debloated prompts | every agent/step fragment is 33–46 lines; `test/prompts.test.ts:401-520` enforces ≤15 non-empty added lines per fragment and total ≤80 | implemented |
-
----
-
-## 5. Existing Tests & Conventions
-
-### 5.1 Conventions
-
-- Runner: `bun test` from `plugins/software-factory` (`package.json` scripts: `test`, `typecheck`). Behavior-only tests; no lint/format assertions (per spec item 15).
-- Harness: `FakeHarness` replays scripted outcomes by step label (`src/harness/fake/fake-harness.ts`), so tests exercise the real `runAgentStep`/`runTask` paths.
-- Repos: `test/helpers/tmp-repo.ts:32-134` creates a temp git repo on `main` with deterministic env, plus worktree/branch helpers and `cleanup()`.
-- Assertions are on-disk facts: read `concerns/*.yaml`, `steer/tousertoreview/*.yaml`, `state.yaml`; commits are verified with `git cat-file -e HEAD:<path>` (e.g. `test/engine/concerns-funnel.test.ts:388-395`), not by trusting in-memory results.
-- Test files carry a doc comment naming the spec §/ADR they lock (e.g. `concerns-funnel.test.ts:29-36`, `funnel-text-budget.test.ts:242`, `epic-saga-propagate.test.ts:23`).
-
-### 5.2 Concern-related suites (all green)
-
-| File | Locks | Notable lines |
-|---|---|---|
-| `test/engine/concerns-funnel.test.ts` (1287 L) | schema write gate, store identity/merge, concurrency, reviewer wiring, producer matrix, reconcile, failure journaling | `:37`, `:124`, `:194`, `:320`, `:347`, `:398`, `:467`, `:845`, `:895`, `:935`, `:980`, `:1130`, `:1263` |
-| `test/engine/reviewer-triage.test.ts` (699 L) | terse hydration, exact-id partition, byte caps, dismiss with reason, routed persistence, `fixRequired`, deduped mailbox, non-triager no-op, engine-flow blocking | `:39`, `:166`, `:197`, `:230`, `:287`, `:323`, `:371`, `:410`, `:454`, `:499`, `:530` |
-| `test/engine/plan-reviewer-triage.test.ts` (513 L) | plan-review hydration, architect-revise concerns, triage ids excluded from the plan fix loop, debt derivation | `:28`, `:151`, `:245`, `:368`, `:436` |
-| `test/engine/funnel-text-budget.test.ts` (482 L) | UTF-8 byte counting, truncation at code-point boundary, all hydration caps, “always fewer bytes”, detail condensing, verbatim prompt vars | `:242-482` |
-| `test/engine/human-router-severity.test.ts` (1023 L) | plan-reviewer stop, close-up async, architect hydration of routed, remarkable digests, escalated dismissal, threshold suppression/downgrade, allowlist skip, exit 10 / park / downgrade flows | `:197-989` |
-| `test/engine/routing-blocker-derive.test.ts` (439 L) | `collectRoutedBlockers`, dependency cascade, terminal/running immunity, task-blocked derivation | `:161-415` |
-| `test/engine/routing-architect-consult.test.ts` (444 L) | one decision file, architect hydration, restart idempotency | `:344`, `:395` |
-| `test/engine/routing-human-debt.test.ts` (523 L) | item blocking vs task continuation per disposition, halt/exit 10, digest-only | `:90`, `:143`, `:189` |
-| `test/engine/closeup-lifecycle-resolve.test.ts` (≈660 L) | accept/reject proposals, missing dismiss note error, consult resolve unblocks, fallback debt, blockers stay open | `:281-598` |
-| `test/engine/epic-saga-propagate.test.ts` | `[epic]` copies of open/routed concerns, dismissed stays local, remarkables, saga-architect hydration, deployed child dirs | `:192-660` |
-| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder` | `:69-390` |
-| `test/engine/state-concern-counts.test.ts` | state counts incl. zeroes and corrupt-skip | `:30-120` |
-| `test/cli/status-concerns.test.ts` | counts line, blocking vs digest split, zero state | `:39-140` |
-| `test/human-involvement-config.test.ts` | defaults, layering, `null` deletion, schema closure, commented presets, criteria fragment selection, prompt-var registration | `:150-476` |
-| `test/contracts/concern-artifact-types.test.ts` (≈500 L) | type-level shape of concerns, lifecycle metadata, `dismiss`, ADR blocking flag, pipeline config, producer typing | `:122`, `:213`, `:242`, `:276`, `:336`, `:434` |
-| `test/contracts/concern-schemas.test.ts` (723 L) | inlined concern defs in every producer schema, `newConcerns`, close-up resolutions, untouched triage/infra/edit schemas, confirmations | `:154-632` |
-| `test/contracts/state-concern-schema.test.ts` | state schema requires all four counts | `:12-36` |
-| `test/prompts.test.ts:401-520` | fragment matrix + prompt-debloat budgets + mode switching inside rendered prompts | `:410`, `:434`, `:464`, `:495`, `:517` |
-
----
-
-## 6. Documentation Gaps (concrete, cited)
-
-These are the parts of the intent not yet satisfied. Every item below is a **documentation** change, not behavior.
-
-| # | Target | Current state | Needed |
-|---|---|---|---|
-| D1 | `plugins/software-factory/docs/ARCHITECTURE.md:39` (§1 row 18) | "**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only." | Mark as implemented; point at the concern store, triage/routing, funnel, ADR modes and the new section; keep the two deviations visible |
-| D2 | ARCHITECTURE body | Only two mentions of “concern” in the whole file (`:39`, `:348`); no section on the concern store/triage/routing/funnel/human modes | Add a section (natural slots: new `### 8.11 Concerns & remarkable decisions funnel (§18)` after §8.10, or a top-level `## 15`); include the status vocabulary, fingerprint/dedup, triage rules, routing table, byte caps, ADR blocking table |
-| D3 | ARCHITECTURE `:282-294` (§8.7 dispositions) | Table lists 6 dispositions; `dismiss` is missing; the note only says the enum is generated from the allowed set | Add the `dismiss` row (triager-only, requires `detail`, kept as `dismissed` with reason) |
-| D4 | ARCHITECTURE `:117` (§5) | "pipeline layers … (epics inherit parent task layer)" — contradicted by `src/cli/run.ts:127-139` + `src/core/engine.ts:247` (only the child task dir's `pipeline.yaml` is loaded); recorded in `docs/adr/adr-epic-config-root-only.md` | Correct the claim and state the deviation (root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics) |
-| D5 | ARCHITECTURE `:186-196` (§6.2 task folder) | Listing omits `concerns/` | Add `concerns/{c-*,rm-*}.yaml` and note the store is engine-owned (committed before stray-dirt repair, `engine.ts:342-347`) |
-| D6 | ARCHITECTURE `:341-356` (§10 agents) | Output column only says `developer … concerns[]` | Reflect `newConcerns`/`remarkable` on review outputs and `concerns`/`remarkable`/`concernConfirms`/`concernResolution` on architect decisions, close-ups, plan |
-| D7 | ARCHITECTURE `:358-367` (§11 CLI) | `status` described as "tree, items, waves, budgets, open tousertoreview" | Mention concern counts and the blocking/digest split (`cli/status.ts:106-124`) |
-| D8 | ARCHITECTURE `:404-406` (§13 testing) | Lists dispositions but not the funnel suite | Add concern funnel coverage (store, triage, routing, funnel budget, ADRs, modes) |
-| D9 | `plugins/software-factory/README.md` | **Zero** mentions of concerns, ADRs or human-involvement modes (grep over the whole file) | Add a short section (e.g. under §3 Configuration) covering `humanInvolvement`, `concerns.*`, `reviewPolicy` + triager `dismiss`, and what `factory status` shows; update §5 docs to the new ARCHITECTURE section range (`README.md:99-105` currently says "§0–§14") |
-| D10 | `plugins/software-factory/agents/criteria/dispositions.md:1-20` | Table lacks `dismiss`; step prompts explain it ad hoc (`agents/steps/review.md:22-23`, `agents/steps/plan-review.md:23`) | Add a `dismiss` row (triager-only, reason required, kept on disk) — or deliberately document that `dismiss` lives only in step prompts |
-| D11 | `plugins/software-factory/config/pipeline.default.yaml:359-376` | `reviewPolicy` commentary lists 6 dispositions, no `dismiss`; §18 block (`:378-432`) is already complete | Mention that triagers get `dismiss` appended automatically (`review-policy.ts:36-42`) and why `human-stop` is absent from the default policy |
-
----
-
-## 7. Open Questions & Uncertainties (for the architect)
-
-**Q1 — Is the remaining scope purely documentation?** Functionally every spec bullet has an implementation and at least one behavior test (§4). The only unticked intent item is the doc set in §6. If the architect agrees, the iteration should be a small doc milestone (D1–D11) plus verification of the two deviations, not a re-implementation.
-
-**Q2 — Autonomous mode deviation: document or implement drain scheduling?** Spec (`docs/factory.v2.md:100`) says the human is consulted "only for the portion still blocked after everything unblocked is done". Implementation routes blocking ADRs at plan time and halts immediately (`flows/adrs.ts:14-18`, `iteration.ts:469-478`); `docs/adr/adr-autonomous-immediate-halt.md` accepts this as out of scope. Decide whether the doc records it as a deviation (recommended by the existing ADR) or the iteration implements deferred halting.
-
-**Q3 — Epic config inheritance deviation: document or implement?** Root-task `pipeline.yaml` overrides (`humanInvolvement`, `concerns`, `reviewPolicy`) do not reach epic child tasks: `src/cli/run.ts:127-139` loads only `{taskDir}/pipeline.yaml`, and `engine.ts:234-247` passes the child dir. `docs/adr/adr-epic-config-root-only.md` flags this and says implementing inheritance would change config semantics for all tasks. ARCHITECTURE `:117` currently makes the incorrect claim (see D4).
-
-**Q4 — Who triages architect output outside the plan?** Only `plan-review` routes through `plan-reviewer`; architect concerns raised in `architect-consult-item`, `architect-consult-nonitem`, `architect-wave-report` and `architect-closeup` are aggregated (`step-runner.ts:260`) but `isTriagerAgent` is true for `reviewer|plan-reviewer` only (`review-policy.ts:18-20`), and close-ups are deliberately non-triagers (`docs/adr/adr-closeup-no-suggestions-triage.md`). Those concerns stay `open` until an architect turn hydrates them (`triage.ts:219-231`) or the wave fallback runs. Is that acceptable coverage of the spec sentence "architect output → plan-reviewer", or does a wave-report reviewer step need to exist?
-
-**Q5 — Simple tasks have no reviewer.** `simple-implement` accepts `concernsYaml` (`prompt-vars.ts:69-70`) and the developer allowlist covers it, but the simple flow has no review step, so its concerns are never triaged and the wave fallback never runs (no waves). Recorded in `docs/adr/adr-closeup-lifecycle-resolved.md` ("simple items have no reviewer"). Document as a known limitation or add a triage path?
-
-**Q6 — Remarkables are exempt from both severity thresholds.** `routeHumanDisposition` digests every routed `rm-*` regardless of `minDigestSeverity` (`triage.ts:108-115`), so all remarkable decisions become non-blocking mailbox entries. Spec line 103 demands the mailbox show "only funnelled, confirmed, low-noise items". Is unconditional digest the intended noise level, or should remarkables be gated by confirmation/severity?
-
-**Q7 — `state.yaml` counts exclude remarkable decisions.** `countConcerns` only counts files whose name starts with `c-` (`concerns.ts:204`), while `rm-*` files exist in the same folder and are triageable (`listConcernIds` `:218-228`). Spec says "status/state.yaml shows counts" without defining scope. Decide whether remarkable counts belong in `ConcernCounts`/`state.schema.json:72-100`/`cli/status.ts:106-108`.
-
-**Q8 — Legacy fingerprint migration.** `legacyConcern` (`concerns.ts:99-119`, `:139-147`) rewrites pre-union `c-*` filenames by kind+summary+location when the new payload carries a detail. Is this still needed after the fire test, or is it dead migration weight that the doc should either describe or the iteration should delete?
-
-**Q9 — Allowlist duplication.** `DEFAULT_RAISE_ALLOWLIST` (`concerns.ts:35-44`) mirrors `config/pipeline.default.yaml:393-401` by hand. There is no test asserting the two lists agree; decide whether to generate one from the other or add a contract test.
-
-**Q10 — Mailbox digest growth.** Every routed `human-awareness`/remarkable writes a persistent `q-concern-<id>` entry (`triage.ts:117-134`) that `factory status` prints under "Digest Questions" (`cli/status.ts:114-116`). Ids dedupe and answered entries are never clobbered (`steer.ts:95-106`), but there is no aging/archival rule. Is unbounded digest growth acceptable, or should the doc define a retention rule?
-
-**Q11 — Concern store ownership vs stray-dirt repair.** The engine commits `{task}/concerns` before repair (`engine.ts:342-347`) and reconciles from records (`:383-394`), but ARCHITECTURE §6.3.6 (`:205`) does not list `concerns/` among engine-owned paths. Confirm the intended wording when updating D5/D2.
-
-**Q12 — Documented-vs-tested byte caps.** `funnel-text-budget.test.ts` locks caps (2000/2000/500) as behavior; the numbers live only in `triage.ts:239-243` and the tests. If the architect documents them (D2), note they are code constants, not config.
-
----
-
-## 8. Sources
-
-- Spec: `docs/factory.v2.md:89-103` (item 18), `:104-112` (item 19/20 context), `:76-88` (items 13–17 context)
-- Architecture: `plugins/software-factory/docs/ARCHITECTURE.md:39`, `:112-119`, `:179-209`, `:220-318`, `:339-367`, `:404-409`
-- README: `plugins/software-factory/README.md:71-105`
-- Fire test: `plugins/software-factory/docs/FIRE_TEST.md:51`
-- Repo ADRs: `docs/adr/adr-*.md` (16 files)
-- Core: `plugins/software-factory/src/core/{concerns,triage,review-policy,artifacts,prompts,prompt-vars,steer}.ts`; `src/core/flows/{step-runner,iteration,item-machine,consults,epic-propagation,adrs}.ts`; `src/core/derive/{task,item,wave}.ts`; `src/core/plan/scheduler.ts`; `src/core/records/review-schema.ts`; `src/core/engine.ts`; `src/cli/{status,run}.ts`
-- Schemas: `plugins/software-factory/config/schemas/{developer-output,fact-finder-output,plan,decisions,review,wave-closeup,plan-closeup,state,pipeline}.schema.json`
-- Config: `plugins/software-factory/config/pipeline.default.yaml:359-456`; `config/project.template.yaml:11`
-- Prompts: `plugins/software-factory/agents/criteria/{human-involvement,dispositions}.md`; `agents/steps/{review,plan-review,qa,develop,fix-round,architect-*}.md`; `agents/architect.md:33`
-- Tests: `plugins/software-factory/test/engine/*concern*`, `reviewer-triage`, `plan-reviewer-triage`, `funnel-text-budget`, `human-router-severity`, `routing-*`, `adr-blocking-digest`, `epic-saga-propagate`, `closeup-lifecycle-resolve`, `state-concern-counts`; `test/cli/status-concerns.test.ts`; `test/human-involvement-config.test.ts`; `test/contracts/*concern*`; `test/prompts.test.ts:401-520`; `test/helpers/tmp-repo.ts`
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
-- rationale (string, optional): Technical justification for this decision
-- text (string, optional): Concrete guidance or steering directives
-- persist (boolean, optional): Whether guidance persists across subsequent attempts
-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
-- outline (object, optional): Item outline to schedule when decision is fix-item
-- debt (string, optional): Technical debt description when decision is accept-with-debt
-- reason (string, optional): Reason for abandonment or abort
-- question (string, optional): Specific question for human operator when decision is human-async or blocked
-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
diff --git a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/meta.yaml b/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/meta.yaml
deleted file mode 100644
index 500fa73..0000000
--- a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 88
-name: consult-prompts-dismiss-filter
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1b894-4755-7787-a1ed-8df6c7a062a2
-timeoutSec: 7200
-status: ok
-startedAt: 2026-11-09T08:37:58.037Z
-endedAt: 2026-11-09T08:38:45.199Z
-usage:
-  inputTokens: 555210
-  outputTokens: 1501
-  costUsd: 0.058037
-traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-34-47-765Z_01a1b894-4755-7787-a1ed-8df6c7a062a2.jsonl
diff --git a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/output.yaml b/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/output.yaml
deleted file mode 100644
index f84ca45..0000000
--- a/.factory/tasks/concerns-funnel/runs/088-consult-prompts-dismiss-filter-a1/output.yaml
+++ /dev/null
@@ -1,20 +0,0 @@
-context: item
-decision: retry-with-guidance
-persist: true
-rationale: "Both develop attempts failed on yield shape, not code: 'Agent output
-  failed schema validation: /: must be object'. The diff shows the
-  implementation landed (dispositions.md +2, prompts.ts +10/-9, prompts.test.ts
-  +92/-6), so the work is likely done but the final yield was emitted as a bare
-  string/diff instead of the required DeveloperOutputArtifact object. Retry
-  needs zero code changes — only a correctly shaped yield."
-text: "Retry develop as a yield-only round: make NO code changes (diff already
-  implements the row + filter + test). Your entire job is to emit a valid
-  DeveloperOutputArtifact OBJECT via the yield tool: { status: 'ok', summary:
-  '<1-2 sentences on dismiss row + filter + QA/reviewer test + gates>',
-  evidence: ['typecheck command + result', 'TMPDIR=/tmp bun test result'] }. Do
-  NOT yield a bare string, a diff, or prose outside the object — that is exactly
-  what failed twice ('/: must be object'). Before yielding, re-run cd
-  plugins/software-factory && bun run typecheck and TMPDIR=/tmp bun test
-  test/prompts.test.ts (full suite if quick) and quote results in evidence. If
-  those fail, report status failed with the failure output instead of another
-  malformed ok."
diff --git a/.factory/tasks/concerns-funnel/state.yaml b/.factory/tasks/concerns-funnel/state.yaml
index c8a2316..285c497 100644
--- a/.factory/tasks/concerns-funnel/state.yaml
+++ b/.factory/tasks/concerns-funnel/state.yaml
@@ -4,14 +4,6 @@ status: active
 iteration: 4
 currentWave: 1
 items:
-  allowlist-agreement-test:
-    kind: test-only
-    status: ready
-    branch: topic/concerns-funnel--allowlist-agreement-test
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.00643
-    currentStep: review
   closeup-triager-cleanup:
     kind: dev
     status: merged
@@ -56,14 +48,6 @@ items:
     spendUsd: 0.32775099999999996
     currentStep: review
     mergedAt: 2026-11-08T18:51:44-05:00
-  prompts-dismiss-filter:
-    kind: dev
-    status: running
-    branch: topic/concerns-funnel--prompts-dismiss-filter
-    attempts: 2
-    fixRounds: 1
-    spendUsd: 0.060164999999999996
-    currentStep: develop
   schema-detail-normalize:
     kind: dev
     status: running
@@ -72,14 +56,6 @@ items:
     fixRounds: 1
     spendUsd: 0.224583
     currentStep: test-first
-  schema-detail-normalize-v2:
-    kind: dev
-    status: running
-    branch: topic/concerns-funnel--schema-detail-normalize-v2
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0.10362199999999999
-    currentStep: qa
   spike-saga-commit:
     kind: fact-finder
     status: ready
@@ -120,13 +96,6 @@ items:
     attempts: 1
     fixRounds: 1
     spendUsd: 0
-  docs-finish-v5:
-    kind: dev
-    status: pending
-    branch: topic/concerns-funnel--docs-finish-v5
-    attempts: 1
-    fixRounds: 1
-    spendUsd: 0
   epic-saga-propagate:
     kind: dev
     status: merged
@@ -704,16 +673,16 @@ debt:
     inconsistent with documented branch-from-HEAD worktrees"
   - "[funnel-closeups-v3] Propagated parent copy retains child source.item,
     writes undeclared source.epic, and can clobber/lengthen parent records"
-budgetSpentUsd: 9.198593920000002
+budgetSpentUsd: 9.024380920000002
 spendByRole:
   alt-workhorse:
-    costUsd: 2.064537
-    inputTokens: 10147554
-    outputTokens: 3048019
+    costUsd: 2.0334369999999993
+    inputTokens: 10035135
+    outputTokens: 2968959
   workhorse:
-    costUsd: 5.810889919999998
-    inputTokens: 12651657
-    outputTokens: 3566211
+    costUsd: 5.6677769200000006
+    inputTokens: 12348121
+    outputTokens: 3457819
   architect:
     costUsd: 1.2247529999999998
     inputTokens: 11067691
@@ -723,18 +692,14 @@ spendByRole:
     inputTokens: 393406
     outputTokens: 255367
 spendByItem:
-  contracts-drift-fix:
-    costUsd: 0.16688999999999998
-    inputTokens: 450079
-    outputTokens: 214518
+  concerns-contracts:
+    costUsd: 0.251577
+    inputTokens: 593198
+    outputTokens: 339057
   concerns-store-v2:
     costUsd: 0.613799
     inputTokens: 2193288
     outputTokens: 413791
-  hydration-fingerprint-caps:
-    costUsd: 0.720326
-    inputTokens: 2521130
-    outputTokens: 580992
   routing-human-debt-v2:
     costUsd: 0.14427299999999998
     inputTokens: 381176
@@ -755,10 +720,6 @@ spendByItem:
     costUsd: 0.10916100000000001
     inputTokens: 270524
     outputTokens: 128516
-  prompt-fragments:
-    costUsd: 0.32775099999999996
-    inputTokens: 1269182
-    outputTokens: 271111
   routing-architect-consult-v3:
     costUsd: 0.11368900000000001
     inputTokens: 278071
@@ -775,18 +736,10 @@ spendByItem:
     costUsd: 0.670065
     inputTokens: 2995526
     outputTokens: 363902
-  closeup-lifecycle-resolve:
-    costUsd: 0.448594
-    inputTokens: 1109776
-    outputTokens: 396435
-  closeup-triager-cleanup:
-    costUsd: 0.113647
-    inputTokens: 392214
-    outputTokens: 101004
-  human-router-severity:
-    costUsd: 0.206566
-    inputTokens: 470606
-    outputTokens: 168535
+  funnel-closeups-v3:
+    costUsd: 0.630073
+    inputTokens: 1662764
+    outputTokens: 428767
   concerns-contracts-types:
     costUsd: 0.063129
     inputTokens: 178070
@@ -795,52 +748,56 @@ spendByItem:
     costUsd: 0.268401
     inputTokens: 734306
     outputTokens: 188631
-  epic-saga-propagate:
-    costUsd: 0.37333400000000005
-    inputTokens: 895689
-    outputTokens: 273259
-  prompts-dismiss-filter:
-    costUsd: 0.060164999999999996
-    inputTokens: 144017
-    outputTokens: 45730
   spike-text-budget:
     costUsd: 0.060779
     inputTokens: 139871
     outputTokens: 72059
-  concerns-contracts:
-    costUsd: 0.251577
-    inputTokens: 593198
-    outputTokens: 339057
-  funnel-closeups-v3:
-    costUsd: 0.630073
-    inputTokens: 1662764
-    outputTokens: 428767
   spike-saga-commit:
     costUsd: 0.131932
     inputTokens: 263905
     outputTokens: 109900
-  schema-detail-normalize-v2:
-    costUsd: 0.10362199999999999
-    inputTokens: 225081
-    outputTokens: 125601
   routing-architect-consult-v2:
     costUsd: 0.198996
     inputTokens: 463902
     outputTokens: 217893
-  allowlist-agreement-test:
-    costUsd: 0.00643
-    inputTokens: 26723
-    outputTokens: 6210
+  contracts-drift-fix:
+    costUsd: 0.16688999999999998
+    inputTokens: 450079
+    outputTokens: 214518
+  hydration-fingerprint-caps:
+    costUsd: 0.720326
+    inputTokens: 2521130
+    outputTokens: 580992
   schema-detail-normalize:
     costUsd: 0.224583
     inputTokens: 381919
     outputTokens: 191751
+  prompt-fragments:
+    costUsd: 0.32775099999999996
+    inputTokens: 1269182
+    outputTokens: 271111
+  closeup-lifecycle-resolve:
+    costUsd: 0.448594
+    inputTokens: 1109776
+    outputTokens: 396435
+  human-router-severity:
+    costUsd: 0.206566
+    inputTokens: 470606
+    outputTokens: 168535
+  epic-saga-propagate:
+    costUsd: 0.37333400000000005
+    inputTokens: 895689
+    outputTokens: 273259
   docs-finish-v3:
     costUsd: 0.06335400000000001
     inputTokens: 146385
     outputTokens: 43223
   (orchestration):
-    costUsd: 2.1853950000000006
-    inputTokens: 13686798
-    outputTokens: 1220222
-lastUpdated: 2026-11-09T08:37:57.925Z
+    costUsd: 2.1813990000000008
+    inputTokens: 13666664
+    outputTokens: 1210311
+  closeup-triager-cleanup:
+    costUsd: 0.113647
+    inputTokens: 392214
+    outputTokens: 101004
+lastUpdated: 2026-11-09T08:03:47.651Z
diff --git a/plugins/software-factory/agents/criteria/dispositions.md b/plugins/software-factory/agents/criteria/dispositions.md
index fcfb3d6..591ed4a 100644
--- a/plugins/software-factory/agents/criteria/dispositions.md
+++ b/plugins/software-factory/agents/criteria/dispositions.md
@@ -10,9 +10,11 @@ Criteria for assigning disposition to review findings:
 | `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
 | `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
 | `human-stop` | Critical safety violation, catastrophic regression risk, or irreversible data loss hazard. Offered ONLY when enabled in pipeline `reviewPolicy`. | Enters `steer/tousertoreview/{id}.yaml` and halts factory execution immediately (exit code 10). |
+| `dismiss` | Stale, invalid, or already-addressed concern; triager-only, requires a reason in `detail`. Concern record is kept on disk. | Closes the concern as `dismissed` with the reason; nothing is routed. |
 
 ## Rules
 - Defect requiring code change MUST be `fix`.
 - Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
 - Do NOT use `human-async` when repo context or architecture docs provide the answer.
 - `human-stop` is restricted to critical safety/fatal conditions and only when permitted by active review policy.
+- `dismiss` is triager-only, requires a reason, and keeps the concern on disk.
diff --git a/plugins/software-factory/src/core/prompts.ts b/plugins/software-factory/src/core/prompts.ts
index 8ffa554..d363b8d 100644
--- a/plugins/software-factory/src/core/prompts.ts
+++ b/plugins/software-factory/src/core/prompts.ts
@@ -85,7 +85,8 @@ export function formatHumanInvolvementCriteria(
 
 /**
  * Formats the dispositions criteria section for review prompts (§8.7).
- * Drops `human-stop` rows unless the agent's allowed dispositions include it.
+ * Drops `human-stop` and `dismiss` rows/rules unless the agent's allowed
+ * dispositions include them (e.g. QA excludes both; triagers get `dismiss`).
  */
 export function formatDispositionsSection(
   dispositionsCriteria: string | undefined,
@@ -96,14 +97,14 @@ export function formatDispositionsSection(
     `Use ONLY these dispositions; any other disposition value fails validation.`,
   ];
   if (dispositionsCriteria && dispositionsCriteria.trim().length > 0) {
-    let criteriaText = dispositionsCriteria;
-    if (!allowedDispositions.includes("human-stop")) {
-      criteriaText = criteriaText
-        .split("\n")
-        .filter((line) => !line.includes("human-stop"))
-        .join("\n")
-        .trim();
-    }
+    const excluded = ["human-stop", "dismiss"].filter(
+      (d) => !allowedDispositions.includes(d)
+    );
+    const criteriaText = dispositionsCriteria
+      .split("\n")
+      .filter((line) => !excluded.some((d) => line.includes(d)))
+      .join("\n")
+      .trim();
     if (criteriaText.length > 0) lines.push(criteriaText);
   }
   return lines.join("\n");
diff --git a/plugins/software-factory/test/prompts.test.ts b/plugins/software-factory/test/prompts.test.ts
index 74715c3..154fdc5 100644
--- a/plugins/software-factory/test/prompts.test.ts
+++ b/plugins/software-factory/test/prompts.test.ts
@@ -12,8 +12,16 @@ import {
 } from "../src/core/prompts.js";
 import { KNOWN_VARS } from "../src/core/prompt-vars.js";
 import { loadPipelineConfig } from "../src/core/config/loader.js";
+import { isTriagerAgent, resolveReviewAllowed } from "../src/core/review-policy.js";
 import type { PipelineConfig } from "../src/core/artifacts.js";
 
+/** Samples every placeholder the fragment declares (render helper). */
+function sampleVars(fragment: string): Record<string, string> {
+  const vars: Record<string, string> = {};
+  for (const name of KNOWN_VARS[fragment] ?? []) vars[name] = `sample-${name}`;
+  return vars;
+}
+
 /**
  * Fragment matrix (docs/adr/adr-prompt-fragment-matrix.md): every fragment that
  * receives hydrated open concerns. Producers raise concerns; reviewers,
@@ -398,14 +406,92 @@ tools:
   });
 });
 
-describe("prompts: concern fragment matrix (adr-prompt-fragment-matrix)", () => {
+/**
+ * adr-dismiss-criteria-row: dispositions.md carries one terse dismiss row and
+ * rule (triager-only, reason required, kept on disk). formatDispositionsSection
+ * filters dismiss rows/rules when the allowed set excludes it (QA), keeps them
+ * for triager reviewers, and still filters human-stop, mirroring existing rules.
+ */
+describe("prompts: dismiss disposition contract (adr-dismiss-criteria-row)", () => {
   const builtinDir = path.resolve("agents");
+  const criteriaText = fs.readFileSync(
+    path.join(builtinDir, "criteria/dispositions.md"),
+    "utf8"
+  );
+  const dismissRow = criteriaText
+    .split("\n")
+    .find((line) => /^\|\s*`dismiss`\s*\|/.test(line));
+  const dismissRule = criteriaText
+    .split("\n")
+    .find((line) => /^-\s.*\bdismiss\b/i.test(line));
+
+  it("documents a terse triager-only dismiss row and rule kept on disk", () => {
+    expect(dismissRow).toBeDefined();
+    expect(dismissRow).toMatch(/triager/i);
+    expect(dismissRow).toMatch(/reason/i);
+    expect(dismissRow).toMatch(/kept/i);
+    expect(dismissRule).toBeDefined();
+  });
+
+  it("filters dismiss rows and rules unless the allowed set includes dismiss", () => {
+    const criteria = [
+      "| `fix` | defect | loop |",
+      "| `dismiss` | stale concern | kept on disk |",
+      "| `human-stop` | critical | halt |",
+      "- Use `dismiss` only with a reason.",
+    ].join("\n");
 
-  function sampleVars(fragment: string): Record<string, string> {
-    const vars: Record<string, string> = {};
-    for (const name of KNOWN_VARS[fragment] ?? []) vars[name] = `sample-${name}`;
-    return vars;
-  }
+    const qa = formatDispositionsSection(criteria, ["fix", "optional"]);
+    expect(qa).toContain("Allowed dispositions for this review: fix, optional.");
+    expect(qa).toContain("`fix`");
+    expect(qa).not.toMatch(/dismiss/i);
+    expect(qa).not.toContain("human-stop");
+
+    const reviewer = formatDispositionsSection(criteria, [
+      "fix",
+      "optional",
+      "dismiss",
+    ]);
+    expect(reviewer).toContain("| `dismiss` | stale concern | kept on disk |");
+    expect(reviewer).toContain("- Use `dismiss` only with a reason.");
+    expect(reviewer).not.toContain("human-stop");
+  });
+
+  it("renders dismiss criteria for triager reviewers but not QA", () => {
+    const { config } = loadPipelineConfig();
+    const lib = loadPromptLibrary({ builtinDir });
+    const criteria = loadCriteriaBundle(config.criteria).dispositions;
+    expect(criteria).toBeDefined();
+    expect(dismissRow).toBeDefined();
+    expect(dismissRule).toBeDefined();
+
+    const qaAllowed = resolveReviewAllowed(config, "qa", isTriagerAgent("qa"));
+    const reviewerAllowed = resolveReviewAllowed(
+      config,
+      "reviewer",
+      isTriagerAgent("reviewer")
+    );
+    expect(qaAllowed).not.toContain("dismiss");
+    expect(reviewerAllowed).toContain("dismiss");
+
+    const render = (fragment: string, allowed: string[]): string =>
+      lib.render(fragment, {
+        ...sampleVars(fragment),
+        dispositionsCriteria: formatDispositionsSection(criteria, allowed),
+        humanInvolvementCriteria: "",
+        concernsYaml: "",
+      });
+
+    expect(render("steps/qa", qaAllowed)).not.toMatch(/dismiss/i);
+
+    const reviewerPrompt = render("steps/review", reviewerAllowed);
+    expect(reviewerPrompt).toContain(dismissRow!);
+    expect(reviewerPrompt).toContain(dismissRule!);
+  });
+});
+
+describe("prompts: concern fragment matrix (adr-prompt-fragment-matrix)", () => {
+  const builtinDir = path.resolve("agents");
 
   it("registers concernsYaml for every concern-producing and triaging fragment", () => {
     for (const fragment of CONCERN_FRAGMENTS) {

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
