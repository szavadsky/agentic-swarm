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
  "slug": "baseline-violations-fix",
  "kind": "no-behavior",
  "title": "Fix SIM102, too-many-locals, C0208",
  "assignment": "GOAL: Behavior-preserving fixes serialized after runner-format-contract onto its phase-1a call-site shape; baseline stays []. SCOPE: shared cli.py ownership requires applying onto runner merge. STEPS: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102: elif TypeAlias plus nested if AssignName to single combined condition. (2) cli.py:50 _run_tool_pipeline 23 to 20 or fewer locals by extracting phase and select helpers with no pipeline semantics change. (3) tests/runner/_factories_extras.py:383 C0208 set-iteration to sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). VERIFY: lint gate reports zero violations in src and tests, pytest plus integration show no new failures, golden byte-identical, baseline []. CONSTRAINTS: no-behavior kind; test diff must show no semantic assertion weakens or shifts.",
  "outlineRef": "baseline-violations-fix",
  "milestone": "M1",
  "wave": 2,
  "deps": [
    "runner-format-contract"
  ],
  "scenarioRefs": [
    "M1-1"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159",
    "AGENTS.md:121-139",
    "lint.baseline:1-1"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..84c2e21
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,219 @@
+checks:
+  - id: gates
+    status: pass
+    message: "Gates passed (4 gates, improvements:
+      tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_too\
+      ls_then_present,
+      tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_the\
+      n_autofix_and_no_duplicates,
+      tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_too\
+      ls_then_covered,
+      tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_complete\
+      ness_given_all_tools_then_have_parser,
+      tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invarian\
+      ts[package_name_none_skips_stubtest_verifytypes])"
+    details:
+      - id: format
+        command: uv run ruff format --check --config config/ruff.toml src tests
+        status: pass
+        durationMs: 375
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 307580
+        details: |-
+          =================================
+          [tach check] PASSED [0.4s]
+          ============================================================
+          Configuration
+          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
+          ✅ All modules validated!
+
+          ============================================================
+          [ruff check] PASSED [0.0s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [rumdl check] PASSED [0.0s]
+          ============================================================
+
+          Success: No issues found in 20 files (23ms)
+
+          ============================================================
+          [mypy] PASSED [6.8s]
+          ============================================================
+          Success: no issues found in 56 source files
+
+          ============================================================
+          [yamllint] PASSED [0.2s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.2s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [8.9s]
+          ===
+          ... [truncated 624 bytes] ...
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [11.6s]
+          ============================================================
+          {
+              "messages": [],
+              "statistics": {
+                  "messageTypeCount": {
+                      "fatal": 0,
+                      "error": 0,
+                      "warning": 0,
+                      "refactor": 0,
+                      "convention": 0,
+                      "info": 0
+                  },
+                  "modulesLinted": 58,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [pylint-pyi] PASSED [10.6s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [17.1s]
+          ============================================================
+          {
+              "messages": [],
+              "statistics": {
+                  "messageTypeCount": {
+                      "fatal": 0,
+                      "error": 0,
+                      "warning": 0,
+                      "refactor": 0,
+                      "convention": 0,
+                      "info": 0
+                  },
+                  "modulesLinted": 75,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] FAILED (exit=123) [65.4s]
+          ============================================================
+          ERROR: Potential secrets about to be committed to git repo!
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:81
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:83
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:204
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:328
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:933
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:939
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:945
+
+          Secret Type: Secret Keyword
+          Location:    .factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230
+
+          Possible mitigations:
+            - For information about putting your secrets in a safer place, please ask in
+              #security
+            - Mark false positives with an inline `pragma: allowlist secret` comment
+
+          If a secret has already been committed, visit
+          https://help.github.com/articles/removing-sensitive-data-from-a-repository
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 39170
+        details: |-
+          [Tach] 1374 tests in 59 files unaffected by changes (~36.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ......................................................................ss [ 15%]
+          ss...................................................................... [ 21%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 37%]
+          ........................................................................ [ 42%]
+          ........................................................................ [ 47%]
+          ........................................................................ [ 53%]
+          ........................................................................ [ 58%]
+          ........................................................................ [ 63%]
+          ........................................................................ [ 69%]
+          ........................................................................ [ 74%]
+          ........................................................................ [ 79%]
+          ........................................................................ [ 84%]
+          ........................................................................ [ 90%]
+          ........................................................................ [ 95%]
+          ............................................................             [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1352 passed, 4 skipped, 18 deselected, 4 warnings in 36.79s
+          [Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]
+        improvements:
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+          - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+          - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      - id: test-integration
+        command: uv run pytest tests/integration.py -q
+        status: pass
+        durationMs: 73118
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 4s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 72.04s (0:01:12)
+  - id: size
+    status: pass
+    message: "size passed: 142/300 production lines changed"
+    details:
+      changedLines:
+        added: 87
+        deleted: 55
+        total: 142
+        files:
+          - src/python_setup_lint/checkers/stub/coverage.py
+          - src/python_setup_lint/runner/cli.py
+      limit: 300
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..8121dc8
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,65 @@
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
+  "slug": "baseline-violations-fix",
+  "kind": "no-behavior",
+  "title": "Fix SIM102, too-many-locals, C0208",
+  "assignment": "GOAL: Behavior-preserving fixes serialized after runner-format-contract onto its phase-1a call-site shape; baseline stays []. SCOPE: shared cli.py ownership requires applying onto runner merge. STEPS: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102: elif TypeAlias plus nested if AssignName to single combined condition. (2) cli.py:50 _run_tool_pipeline 23 to 20 or fewer locals by extracting phase and select helpers with no pipeline semantics change. (3) tests/runner/_factories_extras.py:383 C0208 set-iteration to sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). VERIFY: lint gate reports zero violations in src and tests, pytest plus integration show no new failures, golden byte-identical, baseline []. CONSTRAINTS: no-behavior kind; test diff must show no semantic assertion weakens or shifts.",
+  "outlineRef": "baseline-violations-fix",
+  "milestone": "M1",
+  "wave": 2,
+  "deps": [
+    "runner-format-contract"
+  ],
+  "scenarioRefs": [
+    "M1-1"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "CodingRules.md:90-107",
+  "CodingRules.md:139-159",
+  "AGENTS.md:121-139",
+  "lint.baseline:1-1"
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
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..adf467b
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
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
+startedAt: 2026-11-08T13:18:38.657Z
+session: 01a1bb4f-9e27-779c-832a-580a78e750c8
+endedAt: 2026-11-08T13:39:24.249Z
+usage:
+  inputTokens: 83685
+  outputTokens: 36738
+  costUsd: 0.040891
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T13-18-39-655Z_01a1bb4f-9e27-779c-832a-580a78e750c8.jsonl
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..788876e
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,62 @@
+status: ok
+summary: "Fixed SIM102 in stub/coverage.py by combining the TypeAlias/AssignName
+  condition, and reduced _run_tool_pipeline locals from 23 to 18 by extracting
+  _run_fix_phase (phase 1a format + 1b fix passes) and _select_lint_tools
+  (ordered skip-reason selection preserving exact skip-message ordering). The
+  cited C0208 finding at tests/runner/_factories_extras.py:383 is not
+  reproducible in this tree: no set-literal iteration exists in tests (ast-grep
+  scan) and pylint tests passes clean; the table is already a
+  list[ParameterSet], so no test change was needed. Only two prod files
+  modified; baseline untouched at []."
+target:
+  command: uv run pytest -q
+  customTarget: true
+evidence:
+  - "Red state captured pre-fix: `uv run lint --tools 'ruff check,pylint,pylint
+    tests'` showed ruff SIM102 at checkers/stub/coverage.py:196 and pylint R0914
+    'Too many local variables (23/20)' at runner/cli.py:51; pylint tests passed
+    with zero messages."
+  - "Post-fix `uv run lint` (full 14-tool pipeline): tach check, ruff format,
+    ruff check, rumdl check, mypy, yamllint, ty check, mypy.stubtest, pyright
+    check, pyright verify types, pylint, pylint-pyi, pylint tests ALL PASSED."
+  - Only full-lint failure is detect-secrets (exit=123) reporting
+    .factory/tasks/modernize/journal.ndjson and .factory/.../output.yaml
+    locations only; these are orchestration records explicitly out of scope per
+    assignment (owned by secrets-triage-spike).
+  - "`uv run pytest -q`: 1352 passed, 4 skipped, 18 deselected, 4 warnings in
+    42.67s."
+  - "`uv run pytest tests/integration.py -v`: 9 passed in 64.61s
+    (install/lint/update/parity scenarios)."
+  - "Golden/real-pipeline gate: `uv run pytest tests/test_golden.py
+    tests/runner/test_real_pipeline_smoke.py -q`: 27 passed in 6.91s (golden
+    findings byte-identical)."
+  - "Focused pipeline tests: `uv run pytest tests/runner/test_lint_runner.py
+    tests/runner/test_runner_format_contract.py -q`: 70 passed; `uv run pytest
+    tests/checkers/test_stub_coverage.py -q`: 57 passed."
+  - "C0208 audit: `pylint --rcfile=config/.pylintrc --disable=all
+    --enable=use-sequence-for-iteration tests/` reports no C0208; ast-grep 'for
+    $_ in {$$$}: $BODY' over src/tests finds no set-literal iteration; targeted
+    pylint runs (tests and main rcfiles) on tests/runner/_factories_extras.py
+    report empty messages."
+  - "Hygiene: `git diff --check` exit 0; `git status --short` shows only
+    src/python_setup_lint/checkers/stub/coverage.py and
+    src/python_setup_lint/runner/cli.py modified; lint.baseline remains `[]`."
+concerns:
+  - "The assignment's step 3 (C0208 at tests/runner/_factories_extras.py:383)
+    appears stale: the cited line is the list-typed
+    RUN_LINT_FAKE_INVARIANT_CASES table and no set-iteration exists anywhere in
+    tests, so no code change was warranted and the test diff is empty (no
+    semantic assertions touched)."
+  - detect-secrets still fails the full lint gate on .factory orchestration
+    artifacts; per assignment this is explicitly out of scope (owned by
+    secrets-triage-spike). All src/tests violations are zero.
+  - New private helpers _run_fix_phase/_select_lint_tools are intentionally
+    absent from cli.pyi, consistent with the existing M3(b) pattern where
+    private runtime symbols are omitted (mypy.stubtest and pylint-pyi both
+    pass).
+notes: "Behavior preservation: fix mode still runs phase 1a format then phase 1b
+  fix-only before the all-tools lint pass with lint_fix=False;
+  non-fix/statistics semantics unchanged; skip messages are emitted in the same
+  per-spec order as before via ordered (tool, reason) pairs; monkeypatched
+  output._run_cmd/_print_result are still resolved at call time because imports
+  remain inside the helpers."
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..43b8675
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/checks.yaml
@@ -0,0 +1,7 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/input.md b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/input.md
new file mode 100644
index 0000000..e43a4d5
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/input.md
@@ -0,0 +1,647 @@
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
+  "slug": "baseline-violations-fix",
+  "kind": "no-behavior",
+  "title": "Fix SIM102, too-many-locals, C0208",
+  "assignment": "GOAL: Behavior-preserving fixes serialized after runner-format-contract onto its phase-1a call-site shape; baseline stays []. SCOPE: shared cli.py ownership requires applying onto runner merge. STEPS: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102: elif TypeAlias plus nested if AssignName to single combined condition. (2) cli.py:50 _run_tool_pipeline 23 to 20 or fewer locals by extracting phase and select helpers with no pipeline semantics change. (3) tests/runner/_factories_extras.py:383 C0208 set-iteration to sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). VERIFY: lint gate reports zero violations in src and tests, pytest plus integration show no new failures, golden byte-identical, baseline []. CONSTRAINTS: no-behavior kind; test diff must show no semantic assertion weakens or shifts.",
+  "outlineRef": "baseline-violations-fix",
+  "milestone": "M1",
+  "wave": 2,
+  "deps": [
+    "runner-format-contract"
+  ],
+  "scenarioRefs": [
+    "M1-1"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
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
+diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..84c2e21
+--- /dev/null
++++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,219 @@
++checks:
++  - id: gates
++    status: pass
++    message: "Gates passed (4 gates, improvements:
++      tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_too\
++      ls_then_present,
++      tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_the\
++      n_autofix_and_no_duplicates,
++      tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_too\
++      ls_then_covered,
++      tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_complete\
++      ness_given_all_tools_then_have_parser,
++      tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invarian\
++      ts[package_name_none_skips_stubtest_verifytypes])"
++    details:
++      - id: format
++        command: uv run ruff format --check --config config/ruff.toml src tests
++        status: pass
++        durationMs: 375
++        details: 181 files already formatted
++      - id: lint
++        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
++          check,mypy.stubtest,pyright check,pyright verify
++          types,pylint,pylint-pyi,pylint tests,detect-secrets'
++        status: fail
++        durationMs: 307580
++        details: |-
++          =================================
++          [tach check] PASSED [0.4s]
++          ============================================================
++          Configuration
++          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
++          ✅ All modules validated!
++
++          ============================================================
++          [ruff check] PASSED [0.0s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [rumdl check] PASSED [0.0s]
++          ============================================================
++
++          Success: No issues found in 20 files (23ms)
++
++          ============================================================
++          [mypy] PASSED [6.8s]
++          ============================================================
++          Success: no issues found in 56 source files
++
++          ============================================================
++          [yamllint] PASSED [0.2s]
++          ============================================================
++
++          ============================================================
++          [ty check] PASSED [0.2s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [mypy.stubtest] PASSED [8.9s]
++          ===
++          ... [truncated 624 bytes] ...
++            pyright verify types: completenessScore=1
++
++          ============================================================
++          [pylint] PASSED [11.6s]
++          ============================================================
++          {
++              "messages": [],
++              "statistics": {
++                  "messageTypeCount": {
++                      "fatal": 0,
++                      "error": 0,
++                      "warning": 0,
++                      "refactor": 0,
++                      "convention": 0,
++                      "info": 0
++                  },
++                  "modulesLinted": 58,
++                  "score": 10.0
++              }
++          }
++
++          ============================================================
++          [pylint-pyi] PASSED [10.6s]
++          ============================================================
++
++          --------------------------------------------------------------------
++          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
++
++
++          ============================================================
++          [pylint tests] PASSED [17.1s]
++          ============================================================
++          {
++              "messages": [],
++              "statistics": {
++                  "messageTypeCount": {
++                      "fatal": 0,
++                      "error": 0,
++                      "warning": 0,
++                      "refactor": 0,
++                      "convention": 0,
++                      "info": 0
++                  },
++                  "modulesLinted": 75,
++                  "score": 10.0
++              }
++          }
++
++          ============================================================
++          [detect-secrets] FAILED (exit=123) [65.4s]
++          ============================================================
++          ERROR: Potential secrets about to be committed to git repo!
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:81
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:83
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:204
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:328
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:933
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:939
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:945
++
++          Secret Type: Secret Keyword
++          Location:    .factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230
++
++          Possible mitigations:
++            - For information about putting your secrets in a safer place, please ask in
++              #security
++            - Mark false positives with an inline `pragma: allowlist secret` comment
++
++          If a secret has already been committed, visit
++          https://help.github.com/articles/removing-sensitive-data-from-a-repository
++
++          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/config/.pylintrc
++      - id: test
++        command: uv run pytest -q
++        status: pass
++        durationMs: 39170
++        details: |-
++          [Tach] 1374 tests in 59 files unaffected by changes (~36.0s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          ........................................................................ [  5%]
++          ........................................................................ [ 10%]
++          ......................................................................ss [ 15%]
++          ss...................................................................... [ 21%]
++          ........................................................................ [ 26%]
++          ........................................................................ [ 31%]
++          ........................................................................ [ 37%]
++          ........................................................................ [ 42%]
++          ........................................................................ [ 47%]
++          ........................................................................ [ 53%]
++          ........................................................................ [ 58%]
++          ........................................................................ [ 63%]
++          ........................................................................ [ 69%]
++          ........................................................................ [ 74%]
++          ........................................................................ [ 79%]
++          ........................................................................ [ 84%]
++          ........................................................................ [ 90%]
++          ........................................................................ [ 95%]
++          ............................................................             [100%]
++          =============================== warnings summary ===============================
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
++          1352 passed, 4 skipped, 18 deselected, 4 warnings in 36.79s
++          [Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]
++        improvements:
++          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
++          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
++          - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
++          - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
++          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
++      - id: test-integration
++        command: uv run pytest tests/integration.py -q
++        status: pass
++        durationMs: 73118
++        details: |-
++          [Tach] 9 tests in 4 files unaffected by changes (~1m 4s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          .........                                                                [100%]
++          9 passed in 72.04s (0:01:12)
++  - id: size
++    status: pass
++    message: "size passed: 142/300 production lines changed"
++    details:
++      changedLines:
++        added: 87
++        deleted: 55
++        total: 142
++        files:
++          - src/python_setup_lint/checkers/stub/coverage.py
++          - src/python_setup_lint/runner/cli.py
++      limit: 300
+diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..8121dc8
+--- /dev/null
++++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,65 @@
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
++  "slug": "baseline-violations-fix",
++  "kind": "no-behavior",
++  "title": "Fix SIM102, too-many-locals, C0208",
++  "assignment": "GOAL: Behavior-preserving fixes serialized after runner-format-contract onto its phase-1a call-site shape; baseline stays []. SCOPE: shared cli.py ownership requires applying onto runner merge. STEPS: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102: elif TypeAlias plus nested if AssignName to single combined condition. (2) cli.py:50 _run_tool_pipeline 23 to 20 or fewer locals by extracting phase and select helpers with no pipeline semantics change. (3) tests/runner/_factories_extras.py:383 C0208 set-iteration to sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). VERIFY: lint gate reports zero violations in src and tests, pytest plus integration show no new failures, golden byte-identical, baseline []. CONSTRAINTS: no-behavior kind; test diff must show no semantic assertion weakens or shifts.",
++  "outlineRef": "baseline-violations-fix",
++  "milestone": "M1",
++  "wave": 2,
++  "deps": [
++    "runner-format-contract"
++  ],
++  "scenarioRefs": [
++    "M1-1"
++  ],
++  "citations": [
++    "CodingRules.md:90-107",
++    "CodingRules.md:139-159",
++    "AGENTS.md:121-139",
++    "lint.baseline:1-1"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "CodingRules.md:90-107",
++  "CodingRules.md:139-159",
++  "AGENTS.md:121-139",
++  "lint.baseline:1-1"
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
+diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..adf467b
+--- /dev/null
++++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
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
++startedAt: 2026-11-08T13:18:38.657Z
++session: 01a1bb4f-9e27-779c-832a-580a78e750c8
++endedAt: 2026-11-08T13:39:24.249Z
++usage:
++  inputTokens: 83685
++  outputTokens: 36738
++  costUsd: 0.040891
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T13-18-39-655Z_01a1bb4f-9e27-779c-832a-580a78e750c8.jsonl
+diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..788876e
+--- /dev/null
++++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,62 @@
++status: ok
++summary: "Fixed SIM102 in stub/coverage.py by combining the TypeAlias/AssignName
++  condition, and reduced _run_tool_pipeline locals from 23 to 18 by extracting
++  _run_fix_phase (phase 1a format + 1b fix passes) and _select_lint_tools
++  (ordered skip-reason selection preserving exact skip-message ordering). The
++  cited C0208 finding at tests/runner/_factories_extras.py:383 is not
++  reproducible in this tree: no set-literal iteration exists in tests (ast-grep
++  scan) and pylint tests passes clean; the table is already a
++  list[ParameterSet], so no test change was needed. Only two prod files
++  modified; baseline untouched at []."
++target:
++  command: uv run pytest -q
++  customTarget: true
++evidence:
++  - "Red state captured pre-fix: `uv run lint --tools 'ruff check,pylint,pylint
++    tests'` showed ruff SIM102 at checkers/stub/coverage.py:196 and pylint R0914
++    'Too many local variables (23/20)' at runner/cli.py:51; pylint tests passed
++    with zero messages."
++  - "Post-fix `uv run lint` (full 14-tool pipeline): tach check, ruff format,
++    ruff check, rumdl check, mypy, yamllint, ty check, mypy.stubtest, pyright
++    check, pyright verify types, pylint, pylint-pyi, pylint tests ALL PASSED."
++  - Only full-lint failure is detect-secrets (exit=123) reporting
++    .factory/tasks/modernize/journal.ndjson and .factory/.../output.yaml
++    locations only; these are orchestration records explicitly out of scope per
++    assignment (owned by secrets-triage-spike).
++  - "`uv run pytest -q`: 1352 passed, 4 skipped, 18 deselected, 4 warnings in
++    42.67s."
++  - "`uv run pytest tests/integration.py -v`: 9 passed in 64.61s
++    (install/lint/update/parity scenarios)."
++  - "Golden/real-pipeline gate: `uv run pytest tests/test_golden.py
++    tests/runner/test_real_pipeline_smoke.py -q`: 27 passed in 6.91s (golden
++    findings byte-identical)."
++  - "Focused pipeline tests: `uv run pytest tests/runner/test_lint_runner.py
++    tests/runner/test_runner_format_contract.py -q`: 70 passed; `uv run pytest
++    tests/checkers/test_stub_coverage.py -q`: 57 passed."
++  - "C0208 audit: `pylint --rcfile=config/.pylintrc --disable=all
++    --enable=use-sequence-for-iteration tests/` reports no C0208; ast-grep 'for
++    $_ in {$$$}: $BODY' over src/tests finds no set-literal iteration; targeted
++    pylint runs (tests and main rcfiles) on tests/runner/_factories_extras.py
++    report empty messages."
++  - "Hygiene: `git diff --check` exit 0; `git status --short` shows only
++    src/python_setup_lint/checkers/stub/coverage.py and
++    src/python_setup_lint/runner/cli.py modified; lint.baseline remains `[]`."
++concerns:
++  - "The assignment's step 3 (C0208 at tests/runner/_factories_extras.py:383)
++    appears stale: the cited line is the list-typed
++    RUN_LINT_FAKE_INVARIANT_CASES table and no set-iteration exists anywhere in
++    tests, so no code change was warranted and the test diff is empty (no
++    semantic assertions touched)."
++  - detect-secrets still fails the full lint gate on .factory orchestration
++    artifacts; per assignment this is explicitly out of scope (owned by
++    secrets-triage-spike). All src/tests violations are zero.
++  - New private helpers _run_fix_phase/_select_lint_tools are intentionally
++    absent from cli.pyi, consistent with the existing M3(b) pattern where
++    private runtime symbols are omitted (mypy.stubtest and pylint-pyi both
++    pass).
++notes: "Behavior preservation: fix mode still runs phase 1a format then phase 1b
++  fix-only before the all-tools lint pass with lint_fix=False;
++  non-fix/statistics semantics unchanged; skip messages are emitted in the same
++  per-spec order as before via ordered (tool, reason) pairs; monkeypatched
++  output._run_cmd/_print_result are still resolved at call time because imports
++  remain inside the helpers."
+diff --git a/src/python_setup_lint/checkers/stub/coverage.py b/src/python_setup_lint/checkers/stub/coverage.py
+index 7d7ea1a..0e5103f 100644
+--- a/src/python_setup_lint/checkers/stub/coverage.py
++++ b/src/python_setup_lint/checkers/stub/coverage.py
+@@ -193,9 +193,8 @@ def _add_declaration(child: nodes.NodeNG, declarations: set[str]) -> None:
+     elif isinstance(child, (nodes.ImportFrom, nodes.Import)):
+         for name, _ in child.names:
+             declarations.add(name)
+-    elif isinstance(child, nodes.TypeAlias):
+-        if isinstance(child.name, nodes.AssignName):
+-            declarations.add(child.name.name)
++    elif isinstance(child, nodes.TypeAlias) and isinstance(child.name, nodes.AssignName):
++        declarations.add(child.name.name)
+ 
+ 
+ def _index_stub_declarations(checker: StubChecker, module_name: str, stub_path: Path) -> None:
+diff --git a/src/python_setup_lint/runner/cli.py b/src/python_setup_lint/runner/cli.py
+index a1c636c..184f78b 100644
+--- a/src/python_setup_lint/runner/cli.py
++++ b/src/python_setup_lint/runner/cli.py
+@@ -48,6 +48,81 @@ __all__ = [
+ ]
+ 
+ 
++_PACKAGE_REQUIRED_TOOLS = frozenset({"mypy.stubtest", "pyright verify types"})
++
++
++def _run_fix_phase(
++    selected: list[ToolSpec],
++    *,
++    config: RunnerConfig,
++    force: bool,
++    path: str | None,
++    exclude: str | None,
++) -> int:
++    """Run the format and fix-only passes.
++
++    Returns:
++        The accumulated non-zero exit code from the format pass, or 0.
++    """
++    overall_rc = 0
++    cwd = config.cwd
++
++    from .output import _print_result, _run_cmd
++
++    # ── Phase 1a: format pass (ruff format before fix tools) ──
++    for spec in selected:
++        if spec.name not in FORMATTER_ONLY:
++            continue
++        _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
++        strategy = _strategy_for(spec.name, spec)
++        cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
++        result = _run_cmd(cmd, cwd=cwd, label=spec.name)
++        _print_result(result)
++        if result.exit_code != 0:
++            overall_rc = result.exit_code
++    # ── Phase 1b: fix-only pass (mutates files; results discarded) ──
++    for spec in selected:
++        if not spec.supports_fix:
++            continue
++        if spec.name in _PACKAGE_REQUIRED_TOOLS and config.package_name is None:
++            continue
++        _print_tool_notes(spec, fix=True, path=path, exclude=exclude)
++        timeouts = config.tool_timeouts or {}
++        mem_limits = config.tool_memory_limits or {}
++        effective_timeout = timeouts.get(spec.name, spec.timeout)
++        effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
++        file_targets = _autofix_target_paths(spec, config=config, path=path)
++        fix_result = _apply_autofix_conflict_aware(
++            spec,
++            config=config,
++            paths_to_check=file_targets,
++            run_cmd=__import__("functools").partial(
++                _run_cmd,
++                timeout=effective_timeout,
++                memory_limit_mb=effective_mem,
++            ),
++            force=force,
++        )
++        _print_result(fix_result)
++    return overall_rc
++
++
++def _select_lint_tools(
++    selected: list[ToolSpec],
++    config: RunnerConfig,
++) -> list[tuple[ToolSpec, str | None]]:
++    """Pair each tool with its skip reason.
++
++    Returns:
++        One ``(tool, reason)`` pair per selected tool; *reason* is ``None``
++        when the tool can run.
++    """
++    return [
++        (spec, "--package-name not set" if spec.name in _PACKAGE_REQUIRED_TOOLS and config.package_name is None else None)
++        for spec in selected
++    ]
++
++
+ def _run_tool_pipeline(
+     selected: list[ToolSpec],
+     *,
+@@ -70,59 +145,17 @@ def _run_tool_pipeline(
+     # every tool — and thus the baseline — observe the same post-fix file
+     # state, eliminating the pre-fix-vs-post-fix mismatch that produced
+     # non-deterministic baselines.  Without --fix, a single lint pass runs.
+-    if fix and not statistics:
+-        # ── Phase 1a: format pass (ruff format before fix tools) ──
+-        for spec in selected:
+-            if spec.name not in FORMATTER_ONLY:
+-                continue
+-            _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
+-            strategy = _strategy_for(spec.name, spec)
+-            cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
+-            result = _run_cmd(cmd, cwd=cwd, label=spec.name)
+-            _print_result(result)
+-            if result.exit_code != 0:
+-                overall_rc = result.exit_code
+-        # ── Phase 1b: fix-only pass (mutates files; results discarded) ──
+-        for spec in selected:
+-            if not spec.supports_fix:
+-                continue
+-            if spec.name in ("mypy.stubtest", "pyright verify types") and config.package_name is None:
+-                continue
+-            _print_tool_notes(spec, fix=True, path=path, exclude=exclude)
+-            timeouts = config.tool_timeouts or {}
+-            mem_limits = config.tool_memory_limits or {}
+-            effective_timeout = timeouts.get(spec.name, spec.timeout)
+-            effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
+-            file_targets = _autofix_target_paths(spec, config=config, path=path)
+-            fix_result = _apply_autofix_conflict_aware(
+-                spec,
+-                config=config,
+-                paths_to_check=file_targets,
+-                run_cmd=__import__("functools").partial(
+-                    _run_cmd,
+-                    timeout=effective_timeout,
+-                    memory_limit_mb=effective_mem,
+-                ),
+-                force=force,
+-            )
+-            _print_result(fix_result)
+-        # ── Phase 2: lint-only pass over ALL tools (no autofix) ──
+-        lint_fix = False
+-    else:
+-        lint_fix = fix
+-
+-    for spec in selected:
+-        if spec.name in ("mypy.stubtest", "pyright verify types") and config.package_name is None:
+-            print(f"  [{spec.name}] SKIPPED: --package-name not set", file=sys.stderr)
++    run_fix_passes = fix and not statistics
++    lint_fix = False if run_fix_passes else fix
++    if run_fix_passes:
++        overall_rc = _run_fix_phase(selected, config=config, force=force, path=path, exclude=exclude)
++    # ── Phase 2: lint-only pass over ALL tools (no autofix) ──
++    for spec, skip_reason in _select_lint_tools(selected, config):
++        if skip_reason is not None:
++            print(f"  [{spec.name}] SKIPPED: {skip_reason}", file=sys.stderr)
+             continue
+ 
+         _print_tool_notes(spec, fix=fix, path=path, exclude=exclude)
+-
+-        timeouts = config.tool_timeouts or {}
+-        mem_limits = config.tool_memory_limits or {}
+-        effective_timeout = timeouts.get(spec.name, spec.timeout)
+-        effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
+-
+         strategy = _strategy_for(spec.name, spec)
+         cmd = strategy.build_command(config=config, _fix=lint_fix, _path=path, _exclude=exclude)
+         if statistics:
+@@ -131,8 +164,8 @@ def _run_tool_pipeline(
+             cmd,
+             cwd=cwd,
+             label=spec.name,
+-            timeout=effective_timeout,
+-            memory_limit_mb=effective_mem,
++            timeout=(config.tool_timeouts or {}).get(spec.name, spec.timeout),
++            memory_limit_mb=(config.tool_memory_limits or {}).get(spec.name, spec.memory_limit_mb),
+         )
+         results.append(result)
+         if not statistics:
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
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..c51410d
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
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
+startedAt: 2026-11-08T13:48:20.217Z
+session: 01a1bb6a-cc26-77a9-b725-06b779bdb136
+endedAt: 2026-11-08T14:01:27.871Z
+usage:
+  inputTokens: 47788
+  outputTokens: 66392
+  costUsd: 0.020029
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T13-48-20-902Z_01a1bb6a-cc26-77a9-b725-06b779bdb136
diff --git a/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..08802df
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-violations-fix/steps/002-qa-r1-a1/output.yaml
@@ -0,0 +1,4 @@
+status: approved
+summary: "no-behavior verified: SIM102 collapsed, pipeline locals extracted, no
+  test diff, src/tests lint clean, 1352+9 green, baseline []"
+suggestions: []
diff --git a/src/python_setup_lint/checkers/stub/coverage.py b/src/python_setup_lint/checkers/stub/coverage.py
index 7d7ea1a..0e5103f 100644
--- a/src/python_setup_lint/checkers/stub/coverage.py
+++ b/src/python_setup_lint/checkers/stub/coverage.py
@@ -193,9 +193,8 @@ def _add_declaration(child: nodes.NodeNG, declarations: set[str]) -> None:
     elif isinstance(child, (nodes.ImportFrom, nodes.Import)):
         for name, _ in child.names:
             declarations.add(name)
-    elif isinstance(child, nodes.TypeAlias):
-        if isinstance(child.name, nodes.AssignName):
-            declarations.add(child.name.name)
+    elif isinstance(child, nodes.TypeAlias) and isinstance(child.name, nodes.AssignName):
+        declarations.add(child.name.name)
 
 
 def _index_stub_declarations(checker: StubChecker, module_name: str, stub_path: Path) -> None:
diff --git a/src/python_setup_lint/runner/cli.py b/src/python_setup_lint/runner/cli.py
index a1c636c..184f78b 100644
--- a/src/python_setup_lint/runner/cli.py
+++ b/src/python_setup_lint/runner/cli.py
@@ -48,6 +48,81 @@ __all__ = [
 ]
 
 
+_PACKAGE_REQUIRED_TOOLS = frozenset({"mypy.stubtest", "pyright verify types"})
+
+
+def _run_fix_phase(
+    selected: list[ToolSpec],
+    *,
+    config: RunnerConfig,
+    force: bool,
+    path: str | None,
+    exclude: str | None,
+) -> int:
+    """Run the format and fix-only passes.
+
+    Returns:
+        The accumulated non-zero exit code from the format pass, or 0.
+    """
+    overall_rc = 0
+    cwd = config.cwd
+
+    from .output import _print_result, _run_cmd
+
+    # ── Phase 1a: format pass (ruff format before fix tools) ──
+    for spec in selected:
+        if spec.name not in FORMATTER_ONLY:
+            continue
+        _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
+        strategy = _strategy_for(spec.name, spec)
+        cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
+        result = _run_cmd(cmd, cwd=cwd, label=spec.name)
+        _print_result(result)
+        if result.exit_code != 0:
+            overall_rc = result.exit_code
+    # ── Phase 1b: fix-only pass (mutates files; results discarded) ──
+    for spec in selected:
+        if not spec.supports_fix:
+            continue
+        if spec.name in _PACKAGE_REQUIRED_TOOLS and config.package_name is None:
+            continue
+        _print_tool_notes(spec, fix=True, path=path, exclude=exclude)
+        timeouts = config.tool_timeouts or {}
+        mem_limits = config.tool_memory_limits or {}
+        effective_timeout = timeouts.get(spec.name, spec.timeout)
+        effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
+        file_targets = _autofix_target_paths(spec, config=config, path=path)
+        fix_result = _apply_autofix_conflict_aware(
+            spec,
+            config=config,
+            paths_to_check=file_targets,
+            run_cmd=__import__("functools").partial(
+                _run_cmd,
+                timeout=effective_timeout,
+                memory_limit_mb=effective_mem,
+            ),
+            force=force,
+        )
+        _print_result(fix_result)
+    return overall_rc
+
+
+def _select_lint_tools(
+    selected: list[ToolSpec],
+    config: RunnerConfig,
+) -> list[tuple[ToolSpec, str | None]]:
+    """Pair each tool with its skip reason.
+
+    Returns:
+        One ``(tool, reason)`` pair per selected tool; *reason* is ``None``
+        when the tool can run.
+    """
+    return [
+        (spec, "--package-name not set" if spec.name in _PACKAGE_REQUIRED_TOOLS and config.package_name is None else None)
+        for spec in selected
+    ]
+
+
 def _run_tool_pipeline(
     selected: list[ToolSpec],
     *,
@@ -70,59 +145,17 @@ def _run_tool_pipeline(
     # every tool — and thus the baseline — observe the same post-fix file
     # state, eliminating the pre-fix-vs-post-fix mismatch that produced
     # non-deterministic baselines.  Without --fix, a single lint pass runs.
-    if fix and not statistics:
-        # ── Phase 1a: format pass (ruff format before fix tools) ──
-        for spec in selected:
-            if spec.name not in FORMATTER_ONLY:
-                continue
-            _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
-            strategy = _strategy_for(spec.name, spec)
-            cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
-            result = _run_cmd(cmd, cwd=cwd, label=spec.name)
-            _print_result(result)
-            if result.exit_code != 0:
-                overall_rc = result.exit_code
-        # ── Phase 1b: fix-only pass (mutates files; results discarded) ──
-        for spec in selected:
-            if not spec.supports_fix:
-                continue
-            if spec.name in ("mypy.stubtest", "pyright verify types") and config.package_name is None:
-                continue
-            _print_tool_notes(spec, fix=True, path=path, exclude=exclude)
-            timeouts = config.tool_timeouts or {}
-            mem_limits = config.tool_memory_limits or {}
-            effective_timeout = timeouts.get(spec.name, spec.timeout)
-            effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
-            file_targets = _autofix_target_paths(spec, config=config, path=path)
-            fix_result = _apply_autofix_conflict_aware(
-                spec,
-                config=config,
-                paths_to_check=file_targets,
-                run_cmd=__import__("functools").partial(
-                    _run_cmd,
-                    timeout=effective_timeout,
-                    memory_limit_mb=effective_mem,
-                ),
-                force=force,
-            )
-            _print_result(fix_result)
-        # ── Phase 2: lint-only pass over ALL tools (no autofix) ──
-        lint_fix = False
-    else:
-        lint_fix = fix
-
-    for spec in selected:
-        if spec.name in ("mypy.stubtest", "pyright verify types") and config.package_name is None:
-            print(f"  [{spec.name}] SKIPPED: --package-name not set", file=sys.stderr)
+    run_fix_passes = fix and not statistics
+    lint_fix = False if run_fix_passes else fix
+    if run_fix_passes:
+        overall_rc = _run_fix_phase(selected, config=config, force=force, path=path, exclude=exclude)
+    # ── Phase 2: lint-only pass over ALL tools (no autofix) ──
+    for spec, skip_reason in _select_lint_tools(selected, config):
+        if skip_reason is not None:
+            print(f"  [{spec.name}] SKIPPED: {skip_reason}", file=sys.stderr)
             continue
 
         _print_tool_notes(spec, fix=fix, path=path, exclude=exclude)
-
-        timeouts = config.tool_timeouts or {}
-        mem_limits = config.tool_memory_limits or {}
-        effective_timeout = timeouts.get(spec.name, spec.timeout)
-        effective_mem = mem_limits.get(spec.name, spec.memory_limit_mb)
-
         strategy = _strategy_for(spec.name, spec)
         cmd = strategy.build_command(config=config, _fix=lint_fix, _path=path, _exclude=exclude)
         if statistics:
@@ -131,8 +164,8 @@ def _run_tool_pipeline(
             cmd,
             cwd=cwd,
             label=spec.name,
-            timeout=effective_timeout,
-            memory_limit_mb=effective_mem,
+            timeout=(config.tool_timeouts or {}).get(spec.name, spec.timeout),
+            memory_limit_mb=(config.tool_memory_limits or {}).get(spec.name, spec.memory_limit_mb),
         )
         results.append(result)
         if not statistics:

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
