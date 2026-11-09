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
  "slug": "docs-finish-v5",
  "kind": "dev",
  "title": "Docs and suite consolidation",
  "assignment": "Docs closure over landed behavior; depends on wave-1 schema-detail-normalize-v2 + prompts-dismiss-filter — read their landed code for Detail/dismiss contracts (prod budget ~150 lines docs/yaml). Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, src/core/flows/{step-runner,iteration,epic-propagation,adrs}.ts, src/cli/status.ts, config/pipeline.default.yaml:359-432. Update docs/ARCHITECTURE.md: S1 row 18 -> implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only, immediate-halt, triage-coverage) with no 'Deliberately not hand-built'; new S8.11 per m2 scenarios (store layout, fingerprint/dedup, remarkable aggregation/triage + threshold-exemption, triage contract, routing table, byte caps as code constants, engine-owned concerns/ note; close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, no-retention digest; immediate-halt, triage-coverage limitation incl consult/wave-report/closeup via hydration+fallback and simple-task stays open, epic-config root-only, close-up-dismiss, saga semantics); S3 modules, S5 config sample + root-only fix, S6.2 concerns/ + engine-owned, S8.7 dismiss row, S10 outputs, S11 status, S13 suites; canonical ADR format vs historical notes. README: Concerns & human involvement section with per-task principal/detailed examples + status counts/digest output, plus S5 range update. pipeline.default.yaml: reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. DO NOT touch agents/criteria/human-involvement.md. Add test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base via git show HEAD, pass on branch). Verify: TMPDIR=/tmp typecheck + bun test green.",
  "outlineRef": "docs-finish-v5",
  "milestone": "m2-docs-gates",
  "wave": 2,
  "deps": [
    "prompts-dismiss-filter",
    "schema-detail-normalize-v2"
  ],
  "scenarioRefs": [
    "m2-docs-gates:s1",
    "m2-docs-gates:s2",
    "m2-docs-gates:s3",
    "m2-docs-gates:s4",
    "m2-docs-gates:s5",
    "m2-docs-gates:s6",
    "m2-docs-gates:s7",
    "m2-docs-gates:s8"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/docs/ARCHITECTURE.md:39",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/cli/status.ts:83-105",
    "plugins/software-factory/src/core/fingerprint.ts:20-50"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..61ab5f3
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,52 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/docs-concerns.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 14 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test test/docs-concerns.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794217070866-k76rbj818c.xml
+      junitCaseCount: 14
+      junitCaseIds:
+        - "docs: concerns funnel finish (m2-docs-gates).§1 row 18 records item
+          18 implemented with five deviations"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents store
+          layout fingerprint dedup remarkable aggregation and triage contract"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents close-up
+          propose-confirm epic condensing ADR modes counts and byte caps"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 records
+          immediate-halt triage-coverage epic-config close-up-dismiss and saga
+          deviations"
+        - "docs: concerns funnel finish (m2-docs-gates).§3 module layout lists
+          the concerns funnel modules"
+        - "docs: concerns funnel finish (m2-docs-gates).§5 configuration sample
+          includes concern modes and corrects epic layering"
+        - "docs: concerns funnel finish (m2-docs-gates).§6.2 task folder shows
+          the engine-owned concern store"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.7 adds the
+          triager-only dismiss row"
+        - "docs: concerns funnel finish (m2-docs-gates).§10 documents concern
+          fragment vars outputs and byte budgets"
+        - "docs: concerns funnel finish (m2-docs-gates).§11 status prints
+          concern counts and split blocking/digest questions"
+        - "docs: concerns funnel finish (m2-docs-gates).§13 lists the concerns
+          funnel regression suites"
+        - "docs: concerns funnel finish (m2-docs-gates).README documents
+          concerns and human involvement with per-task examples and status
+          output"
+        - "docs: concerns funnel finish (m2-docs-gates).README documentation
+          section points at the concerns funnel"
+        - "docs: concerns funnel finish (m2-docs-gates).pipeline default
+          commentary documents dismiss auto-append and fragment-to-agent
+          mapping"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..0d0df6a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,80 @@
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
+  "slug": "docs-finish-v5",
+  "kind": "dev",
+  "title": "Docs and suite consolidation",
+  "assignment": "Docs closure over landed behavior; depends on wave-1 schema-detail-normalize-v2 + prompts-dismiss-filter — read their landed code for Detail/dismiss contracts (prod budget ~150 lines docs/yaml). Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, src/core/flows/{step-runner,iteration,epic-propagation,adrs}.ts, src/cli/status.ts, config/pipeline.default.yaml:359-432. Update docs/ARCHITECTURE.md: S1 row 18 -> implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only, immediate-halt, triage-coverage) with no 'Deliberately not hand-built'; new S8.11 per m2 scenarios (store layout, fingerprint/dedup, remarkable aggregation/triage + threshold-exemption, triage contract, routing table, byte caps as code constants, engine-owned concerns/ note; close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, no-retention digest; immediate-halt, triage-coverage limitation incl consult/wave-report/closeup via hydration+fallback and simple-task stays open, epic-config root-only, close-up-dismiss, saga semantics); S3 modules, S5 config sample + root-only fix, S6.2 concerns/ + engine-owned, S8.7 dismiss row, S10 outputs, S11 status, S13 suites; canonical ADR format vs historical notes. README: Concerns & human involvement section with per-task principal/detailed examples + status counts/digest output, plus S5 range update. pipeline.default.yaml: reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. DO NOT touch agents/criteria/human-involvement.md. Add test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base via git show HEAD, pass on branch). Verify: TMPDIR=/tmp typecheck + bun test green.",
+  "outlineRef": "docs-finish-v5",
+  "milestone": "m2-docs-gates",
+  "wave": 2,
+  "deps": [
+    "prompts-dismiss-filter",
+    "schema-detail-normalize-v2"
+  ],
+  "scenarioRefs": [
+    "m2-docs-gates:s1",
+    "m2-docs-gates:s2",
+    "m2-docs-gates:s3",
+    "m2-docs-gates:s4",
+    "m2-docs-gates:s5",
+    "m2-docs-gates:s6",
+    "m2-docs-gates:s7",
+    "m2-docs-gates:s8"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/docs/ARCHITECTURE.md:39",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/cli/status.ts:83-105",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/docs/ARCHITECTURE.md:39",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+  "plugins/software-factory/src/core/steer.ts:59-88",
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/cli/status.ts:83-105",
+  "plugins/software-factory/src/core/fingerprint.ts:20-50"
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
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..8d04028
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T09:22:34.788Z
+session: 01a1bf9d-d94c-7025-8594-5eae2d25e4d4
+endedAt: 2026-11-09T09:37:51.055Z
+usage:
+  inputTokens: 109137
+  outputTokens: 57724
+  costUsd: 0.076511
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T09-22-35-468Z_01a1bf9d-d94c-7025-8594-5eae2d25e4d4.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..3f75a7f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,73 @@
+status: ok
+summary: Added test/docs-concerns.test.ts with 14 base-failing sentinel tests
+  covering all m2-docs-gates scenarios (S1 row 18 + five deviations, S8.11
+  store/triage/routing/close-up/epic/ADR/counts/caps/deviations,
+  S3/S5/S6.2/S8.7/S10/S11/S13, README concerns section + docs range, and
+  pipeline.default.yaml commentary). Typecheck passes; all 14 tests fail with
+  assertion failures on the pristine base tree; a /tmp simulation of the planned
+  docs/config edits makes the targeted suite 14/14 pass and the full suite 467
+  pass / 2 skip / 0 fail.
+target:
+  selectors:
+    - test/docs-concerns.test.ts
+  expectRed:
+    - "docs: concerns funnel finish (m2-docs-gates).§1 row 18 records item 18
+      implemented with five deviations"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents store layout
+      fingerprint dedup remarkable aggregation and triage contract"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents close-up
+      propose-confirm epic condensing ADR modes counts and byte caps"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 records immediate-halt
+      triage-coverage epic-config close-up-dismiss and saga deviations"
+    - "docs: concerns funnel finish (m2-docs-gates).§3 module layout lists the
+      concerns funnel modules"
+    - "docs: concerns funnel finish (m2-docs-gates).§5 configuration sample
+      includes concern modes and corrects epic layering"
+    - "docs: concerns funnel finish (m2-docs-gates).§6.2 task folder shows the
+      engine-owned concern store"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.7 adds the triager-only
+      dismiss row"
+    - "docs: concerns funnel finish (m2-docs-gates).§10 documents concern
+      fragment vars outputs and byte budgets"
+    - "docs: concerns funnel finish (m2-docs-gates).§11 status prints concern
+      counts and split blocking/digest questions"
+    - "docs: concerns funnel finish (m2-docs-gates).§13 lists the concerns
+      funnel regression suites"
+    - "docs: concerns funnel finish (m2-docs-gates).README documents concerns
+      and human involvement with per-task examples and status output"
+    - "docs: concerns funnel finish (m2-docs-gates).README documentation section
+      points at the concerns funnel"
+    - "docs: concerns funnel finish (m2-docs-gates).pipeline default commentary
+      documents dismiss auto-append and fragment-to-agent mapping"
+evidence:
+  - TMPDIR=/tmp bun run typecheck (cwd plugins/software-factory) → exit 0
+  - TMPDIR=/tmp bun test test/docs-concerns.test.ts --reporter=junit
+    --reporter-outfile=/tmp/junit-docs-final-red.xml → exit 1, 0 pass / 14 fail,
+    all <failure> assertion failures (no collection/import errors)
+  - "Pristine base check: git archive HEAD plugins/software-factory + the new
+    test file, bun install --frozen-lockfile, TMPDIR=/tmp bun test
+    test/docs-concerns.test.ts → 0 pass / 14 fail"
+  - "Simulated landed state in /tmp (planned ARCHITECTURE/README/config edits):
+    targeted suite → 14 pass / 0 fail; full TMPDIR=/tmp bun test → 467 pass, 2
+    skip, 0 fail"
+  - "Engine JUnit matcher probe using parseJunit + findMatchingCase: all 14
+    expectRed ids resolve to status fail in the red run"
+  - "git status: only plugins/software-factory/test/docs-concerns.test.ts added;
+    no production/docs files modified in test-first"
+concerns:
+  - Docs/README are outside paths.prod, so QA red-test (which restores only
+    paths.prod) would see docs-only tests pass at the item tip. Every test
+    therefore also asserts the config/pipeline.default.yaml commentary (prod) so
+    all 14 stay genuinely red under red-test; develop must land the config
+    commentary together with the docs.
+  - "Sentinel wording is the develop-step contract: exact headings/phrases such
+    as '### 8.11 Concerns funnel', '## 5. Concerns & human involvement', 'root
+    task layer only', 'auto-appended', and 'source.agent' must be added
+    verbatim."
+  - Full-suite green was verified against a /tmp simulation of the planned
+    docs/config edits because test-first scope forbids editing docs/prod files
+    now.
+notes: The 14 tests map to m2 scenarios s1-s8 and enumerate the exact required
+  doc/config content for the develop step. The section() helper is fence-aware
+  so YAML comments in code blocks do not truncate sections. No test asserts
+  lint/style.
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..b0acb5f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,108 @@
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
+        durationMs: 3909
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 86856
+        details: |-
+          bun test v1.4.4 (38afee6c8)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-hd709l/.factory/pipeline.yaml
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
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3279043
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3279043
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3279043
+
+           467 pass
+           2 skip
+           0 fail
+           2794 expect() calls
+          Ran 469 tests across 71 files. [86.72s]
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
+      command: cd plugins/software-factory && bun test test/docs-concerns.test.ts
+        --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794217557069-u908y8fzim.xml
+      junitCaseCount: 14
+      junitCaseIds:
+        - "docs: concerns funnel finish (m2-docs-gates).§1 row 18 records item
+          18 implemented with five deviations"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents store
+          layout fingerprint dedup remarkable aggregation and triage contract"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents close-up
+          propose-confirm epic condensing ADR modes counts and byte caps"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.11 records
+          immediate-halt triage-coverage epic-config close-up-dismiss and saga
+          deviations"
+        - "docs: concerns funnel finish (m2-docs-gates).§3 module layout lists
+          the concerns funnel modules"
+        - "docs: concerns funnel finish (m2-docs-gates).§5 configuration sample
+          includes concern modes and corrects epic layering"
+        - "docs: concerns funnel finish (m2-docs-gates).§6.2 task folder shows
+          the engine-owned concern store"
+        - "docs: concerns funnel finish (m2-docs-gates).§8.7 adds the
+          triager-only dismiss row"
+        - "docs: concerns funnel finish (m2-docs-gates).§10 documents concern
+          fragment vars outputs and byte budgets"
+        - "docs: concerns funnel finish (m2-docs-gates).§11 status prints
+          concern counts and split blocking/digest questions"
+        - "docs: concerns funnel finish (m2-docs-gates).§13 lists the concerns
+          funnel regression suites"
+        - "docs: concerns funnel finish (m2-docs-gates).README documents
+          concerns and human involvement with per-task examples and status
+          output"
+        - "docs: concerns funnel finish (m2-docs-gates).README documentation
+          section points at the concerns funnel"
+        - "docs: concerns funnel finish (m2-docs-gates).pipeline default
+          commentary documents dismiss auto-append and fragment-to-agent
+          mapping"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 7/300 production lines changed"
+    details:
+      changedLines:
+        added: 6
+        deleted: 1
+        total: 7
+        files:
+          - plugins/software-factory/config/pipeline.default.yaml
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..f2ae3ce
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,99 @@
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
+  "slug": "docs-finish-v5",
+  "kind": "dev",
+  "title": "Docs and suite consolidation",
+  "assignment": "Docs closure over landed behavior; depends on wave-1 schema-detail-normalize-v2 + prompts-dismiss-filter — read their landed code for Detail/dismiss contracts (prod budget ~150 lines docs/yaml). Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, src/core/flows/{step-runner,iteration,epic-propagation,adrs}.ts, src/cli/status.ts, config/pipeline.default.yaml:359-432. Update docs/ARCHITECTURE.md: S1 row 18 -> implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only, immediate-halt, triage-coverage) with no 'Deliberately not hand-built'; new S8.11 per m2 scenarios (store layout, fingerprint/dedup, remarkable aggregation/triage + threshold-exemption, triage contract, routing table, byte caps as code constants, engine-owned concerns/ note; close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, no-retention digest; immediate-halt, triage-coverage limitation incl consult/wave-report/closeup via hydration+fallback and simple-task stays open, epic-config root-only, close-up-dismiss, saga semantics); S3 modules, S5 config sample + root-only fix, S6.2 concerns/ + engine-owned, S8.7 dismiss row, S10 outputs, S11 status, S13 suites; canonical ADR format vs historical notes. README: Concerns & human involvement section with per-task principal/detailed examples + status counts/digest output, plus S5 range update. pipeline.default.yaml: reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. DO NOT touch agents/criteria/human-involvement.md. Add test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base via git show HEAD, pass on branch). Verify: TMPDIR=/tmp typecheck + bun test green.",
+  "outlineRef": "docs-finish-v5",
+  "milestone": "m2-docs-gates",
+  "wave": 2,
+  "deps": [
+    "prompts-dismiss-filter",
+    "schema-detail-normalize-v2"
+  ],
+  "scenarioRefs": [
+    "m2-docs-gates:s1",
+    "m2-docs-gates:s2",
+    "m2-docs-gates:s3",
+    "m2-docs-gates:s4",
+    "m2-docs-gates:s5",
+    "m2-docs-gates:s6",
+    "m2-docs-gates:s7",
+    "m2-docs-gates:s8"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/docs/ARCHITECTURE.md:39",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+    "plugins/software-factory/src/core/steer.ts:59-88",
+    "plugins/software-factory/src/core/derive/task.ts:167-205",
+    "plugins/software-factory/src/cli/status.ts:83-105",
+    "plugins/software-factory/src/core/fingerprint.ts:20-50"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/docs-concerns.test.ts"
+  ],
+  "expectRed": [
+    "docs: concerns funnel finish (m2-docs-gates).§1 row 18 records item 18 implemented with five deviations",
+    "docs: concerns funnel finish (m2-docs-gates).§8.11 documents store layout fingerprint dedup remarkable aggregation and triage contract",
+    "docs: concerns funnel finish (m2-docs-gates).§8.11 documents close-up propose-confirm epic condensing ADR modes counts and byte caps",
+    "docs: concerns funnel finish (m2-docs-gates).§8.11 records immediate-halt triage-coverage epic-config close-up-dismiss and saga deviations",
+    "docs: concerns funnel finish (m2-docs-gates).§3 module layout lists the concerns funnel modules",
+    "docs: concerns funnel finish (m2-docs-gates).§5 configuration sample includes concern modes and corrects epic layering",
+    "docs: concerns funnel finish (m2-docs-gates).§6.2 task folder shows the engine-owned concern store",
+    "docs: concerns funnel finish (m2-docs-gates).§8.7 adds the triager-only dismiss row",
+    "docs: concerns funnel finish (m2-docs-gates).§10 documents concern fragment vars outputs and byte budgets",
+    "docs: concerns funnel finish (m2-docs-gates).§11 status prints concern counts and split blocking/digest questions",
+    "docs: concerns funnel finish (m2-docs-gates).§13 lists the concerns funnel regression suites",
+    "docs: concerns funnel finish (m2-docs-gates).README documents concerns and human involvement with per-task examples and status output",
+    "docs: concerns funnel finish (m2-docs-gates).README documentation section points at the concerns funnel",
+    "docs: concerns funnel finish (m2-docs-gates).pipeline default commentary documents dismiss auto-append and fragment-to-agent mapping"
+  ]
+}
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/docs/ARCHITECTURE.md:39",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+  "plugins/software-factory/src/core/steer.ts:59-88",
+  "plugins/software-factory/src/core/derive/task.ts:167-205",
+  "plugins/software-factory/src/cli/status.ts:83-105",
+  "plugins/software-factory/src/core/fingerprint.ts:20-50"
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
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..ddaed02
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T09:37:54.768Z
+session: 01a1bfab-e1a6-73da-b7dd-f4f44e90b6be
+endedAt: 2026-11-09T09:45:57.197Z
+usage:
+  inputTokens: 88713
+  outputTokens: 32400
+  costUsd: 0.044409
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T09-37-55-110Z_01a1bfab-e1a6-73da-b7dd-f4f44e90b6be.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..c666a91
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/docs-finish-v5/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,81 @@
+status: ok
+summary: "Closed the concerns-funnel documentation story. Updated
+  plugins/software-factory/docs/ARCHITECTURE.md: spec row 18 now records
+  **Implemented** with all five deviations (epic-config root-only,
+  close-up-dismiss via resolutions, saga open-only, immediate halt,
+  triage-coverage) and no 'Deliberately not hand-built'; §3 lists the concerns
+  modules; §5 documents the root-only task layer and adds
+  humanInvolvement/concerns sample; §6.2 shows the engine-owned concerns/ store;
+  §8.7 gains the triager-only dismiss row; new §8.11 documents
+  store/fingerprint/dedup, remarkable aggregation and threshold exemption,
+  exact-id triage and routing table, close-up propose/confirm + wave fallback,
+  epic condensing, ADR canonical format/blocking table, c-only counts,
+  no-retention digest, code-constant byte caps (2000/500/8000/120), and all
+  accepted deviations; §10 documents concernsYaml/humanInvolvementCriteria and
+  budgets; §11 documents concern counts and Blocking/Digest question split; §13
+  lists the funnel regression suites. README gains §5 Concerns & human
+  involvement (principal/detailed per-task examples, factory status
+  counts/digest output, §8.11 pointer), documentation section updated to
+  §0–§14/§8.11, testing renumbered. pipeline.default.yaml commentary now
+  documents dismiss auto-append for triagers and source.agent fragment-to-agent
+  mapping. agents/criteria/human-involvement.md untouched. Diff: 93 insertions,
+  11 deletions across 3 files."
+target:
+  selectors:
+    - test/docs-concerns.test.ts
+  expectRed:
+    - "docs: concerns funnel finish (m2-docs-gates).§1 row 18 records item 18
+      implemented with five deviations"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents store layout
+      fingerprint dedup remarkable aggregation and triage contract"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 documents close-up
+      propose-confirm epic condensing ADR modes counts and byte caps"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.11 records immediate-halt
+      triage-coverage epic-config close-up-dismiss and saga deviations"
+    - "docs: concerns funnel finish (m2-docs-gates).§3 module layout lists the
+      concerns funnel modules"
+    - "docs: concerns funnel finish (m2-docs-gates).§5 configuration sample
+      includes concern modes and corrects epic layering"
+    - "docs: concerns funnel finish (m2-docs-gates).§6.2 task folder shows the
+      engine-owned concern store"
+    - "docs: concerns funnel finish (m2-docs-gates).§8.7 adds the triager-only
+      dismiss row"
+    - "docs: concerns funnel finish (m2-docs-gates).§10 documents concern
+      fragment vars outputs and byte budgets"
+    - "docs: concerns funnel finish (m2-docs-gates).§11 status prints concern
+      counts and split blocking/digest questions"
+    - "docs: concerns funnel finish (m2-docs-gates).§13 lists the concerns
+      funnel regression suites"
+    - "docs: concerns funnel finish (m2-docs-gates).README documents concerns
+      and human involvement with per-task examples and status output"
+    - "docs: concerns funnel finish (m2-docs-gates).README documentation section
+      points at the concerns funnel"
+    - "docs: concerns funnel finish (m2-docs-gates).pipeline default commentary
+      documents dismiss auto-append and fragment-to-agent mapping"
+evidence:
+  - TMPDIR=/tmp bun test test/docs-concerns.test.ts -> 14 pass, 0 fail, 253
+    expect() calls (final state).
+  - "Base-tree sentinel check: extracted `git archive HEAD
+    plugins/software-factory` to /tmp/df-base and ran the same test there -> 0
+    pass, 14 fail, proving every sentinel is base-failing per Decision 022."
+  - TMPDIR=/tmp bun run typecheck -> tsc --noEmit clean, exit 0.
+  - TMPDIR=/tmp bun test -> 467 pass, 2 skip, 0 fail across 71 files (full
+    suite).
+  - TMPDIR=/tmp bun test test/config-layering.test.ts
+    test/human-involvement-config.test.ts test/docs-concerns.test.ts -> 28 pass,
+    0 fail.
+  - git diff --stat -> only README.md, config/pipeline.default.yaml,
+    docs/ARCHITECTURE.md changed (93 insertions, 11 deletions);
+    agents/criteria/human-involvement.md untouched.
+concerns:
+  - Full suite ran green (467 pass) and the only further edits were markdown
+    table/prose additions inside ARCHITECTURE.md; the target docs test plus the
+    config-layer and human-involvement suites were re-run green on the final
+    tree.
+notes: Kept the change within the ~150-line docs/yaml budget (93 insertions).
+  Documentation mirrors landed behavior from
+  src/core/{concerns,triage,review-policy,prompts}.ts,
+  flows/{step-runner,iteration,epic-propagation,adrs}.ts, cli/status.ts and the
+  named ADRs, including exact-id triage, dismiss reasons, c-* counts,
+  threshold-exempt rm-* digests, hydration constants, and open-only epic
+  propagation.
diff --git a/plugins/software-factory/README.md b/plugins/software-factory/README.md
index 01f6d00..6c3ba95 100644
--- a/plugins/software-factory/README.md
+++ b/plugins/software-factory/README.md
@@ -96,15 +96,44 @@ Canonical schemas are located in `config/schemas/` (`pipeline.schema.json`, `pro
 
 ---
 
-## 5. Documentation & Architecture
+## 5. Concerns & human involvement
 
-- **Architecture Specification**: `docs/ARCHITECTURE.md` (§0–§14)
+Every agent output may raise structured `concerns[]` and `remarkable[]` decisions. The engine aggregates them into an engine-owned `concerns/` store on the task branch (`c-*.yaml`, `rm-*.yaml`), dedupes by fingerprint, and funnels them through review triage, close-ups and the steer mailbox; the full contract is in ARCHITECTURE §8.11.
+
+`humanInvolvement` selects the noise level (`autonomous`, `principal`, `detailed`). Set it per task in `{orchestrationFolder}/{task}/pipeline.yaml`; task layers are root-only, so epic children do not inherit them. Example overrides:
+
+```yaml
+# principal: block on stack/layer, external interfaces and config shapes
+humanInvolvement: principal
+concerns:
+  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
+  minDigestSeverity: medium
+  minBlockingSeverity: medium
+
+# detailed: also block external-interface and major internal-interface changes
+humanInvolvement: detailed
+concerns:
+  minDigestSeverity: low
+  minBlockingSeverity: low
+```
+
+`factory status <task>` prints concern counts and splits the mailbox into blocking and informational entries:
+
+```
+Concerns: open 2 | dismissed 0 | routed 1 | resolved 4
+Blocking Questions:
+  * [q-concern-c-1a2b3c4d5e] ref: item | disposition: human-async
+Digest Questions:
+  * [q-escalated-rm-6f7g8h9i0j] ref: c-1a2b3c4d5e | disposition: human-awareness
+```
+
+## 6. Documentation & Architecture
+
+- **Architecture Specification**: `docs/ARCHITECTURE.md` (§0–§14; concerns funnel in §8.11)
 - **Harness Adapter**: `docs/OMP_ADAPTER.md` (CLI templates, overlay keys, NDJSON parsing, error classification)
 - **End-to-End Validation**: `docs/FIRE_TEST.md` (Live verification on sample targets)
 
----
-
-## 6. Testing
+## 7. Testing
 
 Run unit tests:
 ```bash
diff --git a/plugins/software-factory/config/pipeline.default.yaml b/plugins/software-factory/config/pipeline.default.yaml
index 419a1aa..d9139d2 100644
--- a/plugins/software-factory/config/pipeline.default.yaml
+++ b/plugins/software-factory/config/pipeline.default.yaml
@@ -367,6 +367,9 @@ harness: omp
 #   - human-awareness: architect decides; recorded for human review
 #   - human-async: item blocks awaiting operator response; other items continue
 #   - human-stop: halts pipeline and exits 10 (deliberately absent from default)
+#   - dismiss: triager-only (reviewer/plan-reviewer); auto-appended to their
+#     allowed dispositions, requires a reason in `detail`, and keeps the
+#     concern on disk as `dismissed`.
 reviewPolicy:
   default:
     - fix
@@ -384,7 +387,9 @@ reviewPolicy:
 # `agents/criteria/human-involvement.md` and the shared blocking table below.
 #
 # `concerns.raiseAllowlist` lists agents whose structured output may raise
-# concerns. `minDigestSeverity` is the lowest severity worth a human digest;
+# concerns. Keys are the raising step's `source.agent`, never its prompt
+# fragment: developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, and architect covers architect-*.
+# `minDigestSeverity` is the lowest severity worth a human digest;
 # `minBlockingSeverity` is the lowest severity that can block an item. Arrays
 # replace wholesale across config layers; `null` deletes a concern key.
 humanInvolvement: autonomous
diff --git a/plugins/software-factory/docs/ARCHITECTURE.md b/plugins/software-factory/docs/ARCHITECTURE.md
index 6060261..c689fdc 100644
--- a/plugins/software-factory/docs/ARCHITECTURE.md
+++ b/plugins/software-factory/docs/ARCHITECTURE.md
@@ -36,7 +36,7 @@ Source spec: `docs/factory.v2.md`. v1: `plugins/software-builder`. This file is
 | 15 philosophy | `agents/_shared/philosophy.md` | Generic python-setup rules in every dev/review prompt. |
 | 16 config | `config/*` | §5; extra agents, checks, hooks at any seam. |
 | 17 bun launch, preflight, omp per iteration | `bin/factory.ts`, `src/cli`, `src/harness/omp` | **Deviation:** spec keeps one omp process per iteration to preserve IRC. Here each agent turn is its own harness process and a persistent role keeps its conversation as a resumable session on disk (same architect context, survives restarts, no live handles). §2, §11. |
-| 18 concerns + remarkable decisions funnel, blocking/non-blocking ADRs, human-involvement modes (added after v2 build) | — | **Deliberately not hand-built**: goal of the first self-hosted fire test `concerns-funnel` (`docs/FIRE_TEST.md` §Self-host), so the factory extends itself. Current state: review dispositions (§8.7) and steering mailbox (§8.8) only. |
+| 18 concerns + remarkable decisions funnel, blocking/non-blocking ADRs, human-involvement modes (added after v2 build) | `src/core/{concerns,triage,review-policy}.ts`, `flows/{step-runner,iteration,epic-propagation,adrs}.ts`, `cli/status.ts` | **Implemented** in the concerns funnel (§8.11), with five accepted deviations: epic-config root-only (`adr-epic-config-root-only`), close-up-dismiss via resolutions (`adr-closeup-no-suggestions-triage`), saga open-only (`adr-epic-push-condensed`), immediate halt (`adr-autonomous-immediate-halt`), triage-coverage (`adr-funnel-triage-coverage`); counts follow `adr-remarkable-counts-semantics`, dismiss criteria `adr-dismiss-criteria-row`. |
 | 19 workspaces via omp isolation, preflight, status/cleanup/gc, commit content from agents, wave-end merger + escalation, saga with independent epic launches, no-model omp tests; 20 architect cache coherence/compaction, schema-free architect output (added after v2 build) | — | **Deliberately not hand-built**: second self-hosted fire-test goal `omp-workspaces`. Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`. |
 | 26 feedback/approval per kind | `reviewPolicy`, `criteria`, §9 | Mechanical checks per kind + disposition criteria in prompts. |
 | Fire test / DoD | `docs/FIRE_TEST.md`, README, templates, schemas | §13. Out of scope (not in spec): pushing, parallel epics. |
@@ -71,8 +71,11 @@ plugins/software-factory/
     git/            naming, worktrees, repo mutex, commit, merge path, HEAD guard
     derive/         task/iteration/wave/item state from records + git
     plan/           plan limits, edits validate/apply, scheduler
-    flows/          ingest, item step machine, iteration, epic, consults, seams
+    flows/          ingest, item step machine, iteration, epic, consults, seams, adrs.ts, epic-propagation.ts
     checks/         gates (+ratchet), targets (junit), red-test, test-diff, size, scope, custom
+    concerns.ts     engine-owned concern store: fingerprint dedup, triage, resolutions, reconcile
+    triage.ts       severity policy, human routing, review triage, hydration byte caps
+    review-policy.ts  triager set + dismiss auto-append, allowed dispositions
     steer.ts        mailbox
     sessions.ts     persistent-agent handles: per-session FIFO turns, resume threading, rehydrate on sessionLost
     prompts.ts      template render
@@ -114,7 +117,7 @@ Rules: core never imports harness code; adapters hold no orchestration logic and
 | File | Required | Content |
 |---|---|---|
 | `<repo>/.factory/project.yaml` | yes (`factory init` from template, committed by init) | `orchestrationFolder` (default `.factory/tasks`), `adrFolder` (`docs/adr`), `worktreeRoot` (`../<repo>.factory-wt`), `scripts` {setup, compile, lint, test} (hints for infra), `paths.tests`, `paths.prod` globs, `skillDirs`. |
-| pipeline layers | no | `config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml` (epics inherit parent task layer). Maps merge, arrays replace, `null` deletes. After the first run all config is read from the task worktree (committed); `factory status` prints its path. |
+| pipeline layers | no | `config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml` (root task layer only; epic children do not inherit the parent task layer). Maps merge, arrays replace, `null` deletes. After the first run all config is read from the task worktree (committed); `factory status` prints its path. |
 
 ```yaml
 models:
@@ -168,8 +171,13 @@ limits: { maxParallelItems: 4, maxParallelTurns: 6, maxStepAttempts: 2, maxInter
 budget: { perTaskUsd: 100, perIterationUsd: 30, perItemUsd: 8 }   # enforced when harness reports usage
 diversity: warn
 harness: omp
+humanInvolvement: autonomous            # autonomous | principal | detailed
+concerns:
+  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
+  minDigestSeverity: medium             # lowest severity worth a human digest
+  minBlockingSeverity: high             # lowest severity that can block an item
 reviewPolicy:
-  default: [fix, optional, architect, human-awareness, human-async]   # human-stop deliberately absent
+  default: [fix, optional, architect, human-awareness, human-async]   # human-stop absent; dismiss auto-appended for triagers
 criteria: { triage: …, dispositions: … }
 prompts: { overrides: {}, extraSkillDirs: [] }
 ```
@@ -189,6 +197,7 @@ Role resolution: alias chain (cycle → error), fallbacks expanded recursively (
   plan/plan-{N}.yaml  plan/plan-{N}.{k}.yaml (amendments)  plan/edits-{N}.{k}.yaml
   items/{item}/assignment.yaml                 # task branch, committed by the edits commit
   items/{item}/steps/…                         # item branch
+  concerns/                                   # engine-owned, task branch: c-*.yaml / rm-*.yaml
   waves/wave-{N}.{w}.yaml   closeup-{N}.yaml   decisions/{seq}-{kind}.yaml
   runs/…   state.yaml (materialized view)   journal.ndjson (audit only)
   {epic}/INTENT.md …                           # child task, written by the edits commit
@@ -290,6 +299,7 @@ Every review-type output: `{status, summary, suggestions: [{id, disposition, sum
 | `human-awareness` | architect decides now; `tousertoreview` item records the decision |
 | `human-async` | `tousertoreview`; item + dependents blocked; others continue; an answer re-runs the step that raised it with the answer in `input.md` |
 | `human-stop` | `tousertoreview`; exit 10. Offered only if in `reviewPolicy` |
+| `dismiss` | triager (reviewer/plan-reviewer) only; requires a reason (non-empty `detail`); concern becomes `dismissed` and is kept on disk with the reason; `dismiss` is auto-appended to the triager's allowed set |
 
 Schema enum + prompt section generated from the agent's allowed set and `criteria.dispositions`.
 
@@ -317,6 +327,41 @@ Pushing branches (operator's job), parallel epics.
 
 Hook agent outputs use the review contract (read-only) except code-writing agents (`output: developer`): at item seams they work in the item worktree; at other seams the engine creates a synthetic item `hook-{name}-{recordSeq}` (own branch/worktree, gates, merge path) before the seam completes. Synthetic items never fire hooks; preflight rejects configs where they would be required to.
 
+### 8.11 Concerns funnel
+
+**Store (engine-owned).** Every task branch carries `concerns/{id}.yaml`, one file per fingerprint: concerns are `c-{fingerprint}.yaml`, remarkable decisions `rm-{fingerprint}.yaml`. ids are `sha256` prefixes of a stable identity: concerns hash `kind + normalized summary + location`, remarkables hash chosen + alternatives. Re-raising merges: longest detail wins, highest severity wins, affects union (deduped/sorted); legacy pre-union `c-*` files are rename-merged on the next raise. Status lifecycle `open | dismissed | routed | resolved`; files also keep the source step record, `lastSeen`, pending resolutions and dismiss reason. `reconcileConcerns` rebuilds the store from committed ok step records at startup, merging idempotently, so a crash or store loss heals from artifacts. Remarkable decisions use the same aggregation and appear as digest-only `rm-*` entries.
+
+**Triage contract.** Triage uses exact-id matching: review suggestions whose id matches a stored concern id are triage, not findings; all remaining suggestions are ordinary findings. Only `isTriagerAgent` (the step's reviewer and plan-reviewer) may triage, and dismiss requires a non-empty `detail` (the reason) or the step fails. Dismissed concerns become `dismissed`, keep the reason on disk and route nothing. `routeHumanDisposition` is the single human router: at or above `minBlockingSeverity` `human-async`/`human-stop` block (below it they downgrade to a `human-awareness` digest); `human-awareness`, dismissed escalated concerns and `rm-*` remarkables are digest-only (`q-concern-{id}` / `q-escalated-{id}`), and remarkables are threshold-exempt. Routing outcomes:
+
+| Outcome | Engine action |
+|---|---|
+| blocker affecting a dependent item | affected item + declared dependents blocked; architect consult before the wave |
+| `architect` | next architect turn |
+| `optional` / tech-debt | plan tech-debt list |
+| `human-*` | steer mailbox under the severity policy |
+| `dismiss` | `dismissed` with reason on disk; nothing routed |
+
+**Close-up propose/confirm.** Close-ups are non-triagers and their schemas have no suggestions: re-triage flows through `concernResolutions`. `applyCloseupResolutions` only stores `pendingResolution` (resolve/carry/propagate/dismiss); architect `applyConcernConfirms` accepts it (resolve closes, carry routes to the architect, dismiss closes with the pending note as reason, propagate clears the local proposal for the epic push) or rejects it. `applyWaveCloseupFallback` handles triage-less open concerns that predate the close-up: tech-debt becomes `optional` debt, assumptions/risks/questions route to the architect, blockers stay open; epic copies are skipped.
+
+**Epic condensing.** `propagateEpicConcerns` copies open/routed child concerns and open remarkables to the parent store: summaries are prefixed `[epic]`, payloads of at most `120` bytes stay verbatim, longer ones are condensed/halved under a `500`-byte cap; the parent copy records `epic:{epic}/{record}` as source and is committed with the child-closeup. Blocked child questions are forwarded as `q-epic-*` questions with blocks remapped from `task` to the parent task slug; propagation is open-only for concerns, and remarkables ride only on unfiltered pushes.
+
+**ADRs.** Engine ADRs are written as canonical ADR markdown (`# title`, `## Context`, `## Decision`, `## Consequences`, `## Blocking`); repo `docs/adr/*.md` one-paragraph notes predate the engine and are historical notes, not the canonical format. Blocking ADRs park the task; remarkable ADRs are digest-only `human-awareness` and never wait. The `humanInvolvement` mode (`autonomous` | `principal` | `detailed`) selects prompt criteria and the blocking table only:
+
+| Mode | Blocking ADR | Remarkable ADR |
+|---|---|---|
+| autonomous | `human-stop` | digest-only `human-awareness` |
+| principal | `human-async` | digest-only `human-awareness` |
+| detailed | `human-async` | digest-only `human-awareness` |
+
+**Counts, digest and budgets.** `countConcerns` reports status counts over `c-*` files only (remarkables are not counted); `factory status` prints them. Digest mailbox entries persist with no retention/archival rule. Hydration caps are code constants, not config: review/qa hydrate up to `2000` bytes of diff, close-ups `2000` bytes of task diff, planning/other steps `500` bytes of prompt input, and `renderConcernsYaml` defaults to an `8000`-byte ceiling; epic copies use `120`/`500`.
+
+**Accepted deviations.**
+- immediate halt: `adr-autonomous-immediate-halt` (awareness `awareness-plan-2-autonomous-halt-deviation`) — a blocking ADR parks the task at plan time, before unblocked work runs, instead of deferring the stop.
+- triage-coverage: `adr-funnel-triage-coverage` (awareness `awareness-plan-4-funnel-triage-coverage-awareness`) — only plan generation is plan-reviewer-triaged; architect concerns from consult/wave-report/close-up turns aggregate but stay open until an architect turn hydrates them, with hydration + wave close-up fallback as the safety net; simple-task concerns stay open because that flow has no reviewer or waves.
+- epic-config root-only: `adr-epic-config-root-only` — epic children do not inherit the parent task layer, so root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach child epics.
+- close-up-dismiss: `adr-closeup-no-suggestions-triage` — close-ups are not triagers; dismiss via resolutions + architect confirm as above.
+- saga open-only: `adr-epic-push-condensed` — only open/routed concerns and open remarkables propagate; forwarded `q-epic-*` questions are the only blocked-signal path.
+
 ## 9. Mechanical checks
 
 | Check | Default phase / onFail | Rule |
@@ -355,6 +400,8 @@ Hook agent outputs use the review contract (read-only) except code-writing agent
 
 Composition (cache-friendly order): `_shared/philosophy.md` + `{agent}.md` (stable) → `steps/{step}.md` → assignment/citations → dynamic feedback last. `{{var}}` only; unknown placeholder = preflight error. Overrides per agent/step. QA/reviewer: developer report is a claim; evidence = engine checks + diff + own inspection. All agents except developer/triage-simple/integrate are read-only.
 
+Producer outputs may also carry structured `concerns[]` and `remarkable[]` (funnel inputs), reviewers may triage them through `suggestions[]`, and close-ups/architects emit `concernResolutions`, `concernConfirms` and `concernResolution`. Prompt fragments receive `concernsYaml` (terse hydrated concerns) and `humanInvolvementCriteria` (active mode + shared blocking table); reviewer/plan-reviewer triage works by exact id. Byte budgets per consumer: review/qa diff up to `2000` bytes, close-up task diff `2000`, planning/other prompt input `500`, renderer default ceiling `8000`; epic copies condense with `120`-byte verbatim and `500`-byte caps.
+
 ## 11. CLI
 
 ```
@@ -364,7 +411,7 @@ bun run factory status <task>                 # tree, items, waves, budgets, ope
 bun run factory steer <task> "text"           # → root task steer/fromuserpending
 bun run factory preflight <task>
 ```
-Preflight: first-run cleanliness (§7), configs + layers valid, roles resolve, templates render, schemas compile, harness binary present and generated harness config valid, run lock free.
+Preflight: first-run cleanliness (§7), configs + layers valid, roles resolve, templates render, schemas compile, harness binary present and generated harness config valid, run lock free. `factory status` additionally prints `Concerns: open N | dismissed N | routed N | resolved N` (counting `c-*` files only) and splits open mailbox entries into `Blocking Questions` and `Digest Questions`; answers go through `factory steer <task> "answer to <id>: …"`.
 
 ## 12. Extensibility, loop prevention, resilience, model splits, token economy
 
@@ -403,6 +450,7 @@ Cache-ordered prompts; assignments carry only their citations + milestone excerp
 
 ## 13. Testing & fire test
 - `bun test` (fake harness + temp git repos), behavior only: crash/restart at each commit point, interrupted not counted, fix loop → consult → escalate, alt-on-retry swap, dispositions incl. human-async blocking dependents and answer re-run, steering single-flight, edits validation, target-red rejects collection errors, red-test catches tests that pass without the prod change, merge path conflict → integrate, HEAD guard, branch naming, session resume threading + sessionLost rehydration.
+- The concerns funnel regression suites: store fingerprint/dedup + legacy migration, review and plan-review triage, close-up propose/confirm lifecycle, hydration byte caps, epic propagation condensing + `q-epic-*` forwarding, ADR blocking table per mode, severity routing and allowlist agreement between config and code defaults, counts/status digest, and docs sentinels (`docs-concerns.test.ts`).
 - Fire test (`docs/FIRE_TEST.md`): `/home/slava/aiexp/python-setup`, GOAL from spec, ≤ 5 launches; operator answers `tousertoreview` via `fromuserpending` (logged); after each launch trace analysis (records, journal, session transcripts) → harness fixes → next launch.
 
 ## 14. Open items
diff --git a/plugins/software-factory/test/docs-concerns.test.ts b/plugins/software-factory/test/docs-concerns.test.ts
new file mode 100644
index 0000000..c2fbda3
--- /dev/null
+++ b/plugins/software-factory/test/docs-concerns.test.ts
@@ -0,0 +1,346 @@
+import { describe, expect, it } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+
+/**
+ * Docs closure for the concerns funnel (m2-docs-gates).
+ *
+ * Every assertion below is a base-failing sentinel: the needle names content
+ * added by docs-finish-v5 and is absent from the base tree (Decision 022).
+ * The test therefore proves the docs/config edits landed, not that the base
+ * already contained generic words such as "concerns", "dismiss" or "digest".
+ */
+
+const pluginRoot = path.resolve(import.meta.dir, "..");
+const read = (relative: string) => fs.readFileSync(path.join(pluginRoot, relative), "utf8");
+
+/**
+ * Returns the body between `heading` and the next heading of the same or
+ * higher level. Headings inside fenced code blocks (e.g. YAML comments) are
+ * ignored.
+ */
+function section(text: string, heading: string): string {
+  const start = text.indexOf(heading);
+  expect({ heading, found: start >= 0 }).toEqual({ heading, found: true });
+  const level = heading.match(/^#+/)?.[0].length ?? 1;
+  const boundary = new RegExp(`^#{1,${level}} `);
+  const rest = text.slice(start + heading.length);
+  let inFence = false;
+  let offset = 0;
+  for (const line of rest.split("\n")) {
+    if (line.startsWith("```")) {
+      inFence = !inFence;
+    } else if (!inFence && boundary.test(line)) {
+      return rest.slice(0, offset);
+    }
+    offset += line.length + 1;
+  }
+  return rest;
+}
+
+/** Returns one `# ====` delimited commentary block from the default pipeline YAML. */
+function yamlBlock(text: string, heading: string): string {
+  const start = text.indexOf(heading);
+  expect({ heading, found: start >= 0 }).toEqual({ heading, found: true });
+  const separator = "\n# ==============================================================================";
+  const bannerEnd = text.indexOf(separator, start + heading.length);
+  const next =
+    bannerEnd >= 0 ? text.indexOf(separator, bannerEnd + separator.length) : -1;
+  return next >= 0 ? text.slice(start, next) : text.slice(start);
+}
+
+function expectContains(body: string, needles: string[], context: string): void {
+  for (const needle of needles) {
+    expect({ context, needle, present: body.includes(needle) }).toEqual({
+      context,
+      needle,
+      present: true,
+    });
+  }
+}
+
+const pipelineYaml = read("config/pipeline.default.yaml");
+
+/**
+ * Red-test guard: QA's red-test restores `paths.prod` (config included) to the
+ * test-first commit but leaves docs/README (outside paths.prod) at the item
+ * tip. Asserting the shipped config commentary in every test keeps each test
+ * genuinely red under that restoration, not only on the pristine base tree.
+ */
+function expectConfigClosure(context: string): void {
+  const review = yamlBlock(pipelineYaml, "# Review Policy & Dispositions");
+  expectContains(review, ["dismiss", "auto-appended", "triager"], `${context}: reviewPolicy commentary`);
+  const concerns = yamlBlock(pipelineYaml, "# Human Involvement & Concerns");
+  expectContains(
+    concerns,
+    [
+      "source.agent",
+      "developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round",
+    ],
+    `${context}: concerns commentary`
+  );
+}
+
+describe("docs: concerns funnel finish (m2-docs-gates)", () => {
+  const architecture = read("docs/ARCHITECTURE.md");
+
+  it("§1 row 18 records item 18 implemented with five deviations", () => {
+    expectConfigClosure("docs closure");
+    const row = architecture.split("\n").find((line) => line.startsWith("| 18 "));
+    expect(row).toBeDefined();
+    expect(row).not.toContain("Deliberately not hand-built");
+    expectContains(
+      row!,
+      [
+        "**Implemented**",
+        "epic-config root-only",
+        "close-up-dismiss via resolutions",
+        "saga open-only",
+        "immediate halt",
+        "triage-coverage",
+        "adr-epic-config-root-only",
+        "adr-closeup-no-suggestions-triage",
+        "adr-epic-push-condensed",
+        "adr-autonomous-immediate-halt",
+        "adr-funnel-triage-coverage",
+      ],
+      "§1 row 18"
+    );
+  });
+
+  it("§8.11 documents store layout fingerprint dedup remarkable aggregation and triage contract", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "### 8.11 Concerns funnel");
+    expectContains(
+      body,
+      [
+        "engine-owned",
+        "concerns/{id}.yaml",
+        "c-{fingerprint}.yaml",
+        "rm-{fingerprint}.yaml",
+        "sha256",
+        "kind + normalized summary + location",
+        "longest detail wins",
+        "highest severity wins",
+        "affects union",
+        "legacy",
+        "open | dismissed | routed | resolved",
+        "reconcileConcerns",
+        "remarkable decisions",
+        "threshold-exempt",
+        "exact-id",
+        "ordinary findings",
+        "dismiss requires a non-empty `detail`",
+        "isTriagerAgent",
+        "routeHumanDisposition",
+        "q-concern-{id}",
+        "q-escalated-{id}",
+        "blocker affecting a dependent item",
+        "next architect turn",
+        "plan tech-debt list",
+      ],
+      "§8.11 store/triage/routing"
+    );
+  });
+
+  it("§8.11 documents close-up propose-confirm epic condensing ADR modes counts and byte caps", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "### 8.11 Concerns funnel");
+    expectContains(
+      body,
+      [
+        "applyCloseupResolutions",
+        "pendingResolution",
+        "applyConcernConfirms",
+        "applyWaveCloseupFallback",
+        "non-triagers",
+        "propagateEpicConcerns",
+        "[epic]",
+        "q-epic-",
+        "condensed",
+        "canonical ADR markdown",
+        "## Blocking",
+        "historical notes",
+        "humanInvolvement",
+        "autonomous",
+        "principal",
+        "detailed",
+        "countConcerns",
+        "c-*",
+        "no retention",
+        "code constants",
+        "2000",
+        "500",
+        "8000",
+        "120",
+      ],
+      "§8.11 closeup/epic/adr/counts/caps"
+    );
+  });
+
+  it("§8.11 records immediate-halt triage-coverage epic-config close-up-dismiss and saga deviations", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "### 8.11 Concerns funnel");
+    expectContains(
+      body,
+      [
+        "immediate halt",
+        "adr-autonomous-immediate-halt",
+        "awareness-plan-2-autonomous-halt-deviation",
+        "plan-reviewer-triaged",
+        "consult/wave-report/close-up",
+        "hydration + wave close-up fallback",
+        "simple-task concerns stay open",
+        "adr-funnel-triage-coverage",
+        "awareness-plan-4-funnel-triage-coverage-awareness",
+        "epic children do not inherit the parent task layer",
+        "adr-epic-config-root-only",
+        "dismiss via resolutions",
+        "adr-closeup-no-suggestions-triage",
+        "open-only",
+        "forwarded `q-epic-*` questions",
+        "adr-epic-push-condensed",
+      ],
+      "§8.11 deviations"
+    );
+  });
+
+  it("§3 module layout lists the concerns funnel modules", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "## 3. Module layout");
+    expectContains(
+      body,
+      ["concerns.ts", "triage.ts", "review-policy.ts", "epic-propagation.ts", "adrs.ts"],
+      "§3"
+    );
+  });
+
+  it("§5 configuration sample includes concern modes and corrects epic layering", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "## 5. Configuration");
+    expect(body).not.toContain("epics inherit parent task layer");
+    expectContains(
+      body,
+      [
+        "root task layer only",
+        "epic children do not inherit",
+        "humanInvolvement: autonomous",
+        "concerns:",
+        "raiseAllowlist:",
+        "minDigestSeverity: medium",
+        "minBlockingSeverity: high",
+        "dismiss auto-appended",
+      ],
+      "§5"
+    );
+  });
+
+  it("§6.2 task folder shows the engine-owned concern store", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "### 6.2 Task folder");
+    expectContains(body, ["concerns/", "c-*.yaml", "rm-*.yaml", "engine-owned"], "§6.2");
+  });
+
+  it("§8.7 adds the triager-only dismiss row", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "### 8.7 Review dispositions");
+    expectContains(
+      body,
+      ["| `dismiss` |", "triager", "requires a reason", "`dismissed`", "kept on disk", "auto-appended"],
+      "§8.7"
+    );
+  });
+
+  it("§10 documents concern fragment vars outputs and byte budgets", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "## 10. Agents & prompts");
+    expectContains(
+      body,
+      [
+        "remarkable[]",
+        "concernsYaml",
+        "humanInvolvementCriteria",
+        "reviewer/plan-reviewer triage",
+        "2000",
+        "500",
+        "8000",
+      ],
+      "§10"
+    );
+  });
+
+  it("§11 status prints concern counts and split blocking/digest questions", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "## 11. CLI");
+    expectContains(
+      body,
+      ["Concerns: open", "dismissed", "routed", "resolved", "Blocking Questions", "Digest Questions", "c-*"],
+      "§11"
+    );
+  });
+
+  it("§13 lists the concerns funnel regression suites", () => {
+    expectConfigClosure("docs closure");
+    const body = section(architecture, "## 13. Testing & fire test");
+    expectContains(
+      body,
+      [
+        "concerns funnel",
+        "fingerprint/dedup",
+        "triage",
+        "hydration byte caps",
+        "epic propagation condensing",
+        "ADR blocking table",
+        "allowlist agreement",
+      ],
+      "§13"
+    );
+  });
+
+  it("README documents concerns and human involvement with per-task examples and status output", () => {
+    expectConfigClosure("docs closure");
+    const readme = read("README.md");
+    const body = section(readme, "## 5. Concerns & human involvement");
+    expectContains(
+      body,
+      [
+        "concerns/",
+        "humanInvolvement",
+        "principal",
+        "detailed",
+        "pipeline.yaml",
+        "factory status",
+        "Concerns: open",
+        "Digest Questions",
+        "§8.11",
+      ],
+      "README concerns section"
+    );
+  });
+
+  it("README documentation section points at the concerns funnel", () => {
+    expectConfigClosure("docs closure");
+    const readme = read("README.md");
+    const body = section(readme, "## 6. Documentation & Architecture");
+    expectContains(body, ["§0–§14", "§8.11"], "README documentation section");
+  });
+
+  it("pipeline default commentary documents dismiss auto-append and fragment-to-agent mapping", () => {
+    expectConfigClosure("docs closure");
+    const config = read("config/pipeline.default.yaml");
+    const review = yamlBlock(config, "# Review Policy & Dispositions");
+    expectContains(review, ["dismiss", "auto-appended", "triager"], "reviewPolicy commentary");
+    const concerns = yamlBlock(config, "# Human Involvement & Concerns");
+    expectContains(
+      concerns,
+      [
+        "source.agent",
+        "fragment",
+        "developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round",
+        "fact-finder covers research",
+        "architect covers architect-*",
+      ],
+      "concerns commentary"
+    );
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
