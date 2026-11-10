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
  "slug": "runner-factories-trim",
  "kind": "test-only",
  "title": "Trim runner factories extras below limit",
  "assignment": "Tests-only (tests/runner/_factories_extras*.py + its importers ONLY, enumerated via grep at HEAD and reported; ~16 modules per pack, verify actual). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; no new failures vs M1 table; golden hash-equal; format-clean.",
  "outlineRef": "runner-factories-trim",
  "milestone": "M2",
  "wave": 3,
  "scenarioRefs": [
    "M2: Factories split without behavior change"
  ],
  "citations": [
    "CodingRules.md:139-159",
    "CodingRules.md:230-306",
    "CodingRules.md:90-107"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..8724550
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,198 @@
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
+        durationMs: 226
+        details: 193 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 80798
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.3s]
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
+          Success: No issues found in 29 files (16ms)
+
+          ============================================================
+          [mypy] PASSED [5.9s]
+          ============================================================
+          Success: no issues found in 57 source files
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
+          [mypy.stubtest] PASSED [9.6s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [6.0s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794202841509",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 112,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 5.401
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.4s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [12.6s]
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
+                  "modulesLinted": 59,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [pylint-pyi] PASSED [12.6s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [21.9s]
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
+                  "modulesLinted": 85,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] PASSED [9.4s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-factories-trim/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 38789
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~28.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ........................................................................ [ 15%]
+          ........................................................................ [ 20%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 36%]
+          ........................................................................ [ 41%]
+          ........................................................................ [ 47%]
+          ........................................................................ [ 52%]
+          ........................................................................ [ 57%]
+          ........................................................................ [ 62%]
+          ........................................................................ [ 67%]
+          ........................................................................ [ 73%]
+          ........................................................................ [ 78%]
+          ........................................................................ [ 83%]
+          ........................................................................ [ 88%]
+          ........................................................................ [ 94%]
+          ........................................................................ [ 99%]
+          .........                                                                [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-factories-trim/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-factories-trim/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-factories-trim/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 36.46s
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
+        durationMs: 72973
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 71.77s (0:01:11)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (5 test files changed)
diff --git a/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..6ff84b2
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,60 @@
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
+  "slug": "runner-factories-trim",
+  "kind": "test-only",
+  "title": "Trim runner factories extras below limit",
+  "assignment": "Tests-only (tests/runner/_factories_extras*.py + its importers ONLY, enumerated via grep at HEAD and reported; ~16 modules per pack, verify actual). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; no new failures vs M1 table; golden hash-equal; format-clean.",
+  "outlineRef": "runner-factories-trim",
+  "milestone": "M2",
+  "wave": 3,
+  "scenarioRefs": [
+    "M2: Factories split without behavior change"
+  ],
+  "citations": [
+    "CodingRules.md:139-159",
+    "CodingRules.md:230-306",
+    "CodingRules.md:90-107"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "CodingRules.md:139-159",
+  "CodingRules.md:230-306",
+  "CodingRules.md:90-107"
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
diff --git a/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..b0f1ad4
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T05:32:43.242Z
+session: 01a1becb-ac11-737f-a028-01338347573b
+endedAt: 2026-11-09T05:43:31.496Z
+usage:
+  inputTokens: 66045
+  outputTokens: 30175
+  costUsd: 0.035248
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T05-33-01-329Z_01a1becb-ac11-737f-a028-01338347573b.jsonl
diff --git a/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..2671320
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-factories-trim/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,58 @@
+status: ok
+summary: "Split the 511-line tests/runner/_factories_extras.py below the pylint
+  max-module-lines limit by moving its self-contained 'Small parametrize tables'
+  group into a new tests/runner/_factories_extras_small.py (byte-identical
+  96-line block), then updated the three consuming test modules to import from
+  the split module. Removed both duplicate `disable=too-many-lines` pragmas (and
+  the stale '502 lines' claim) since neither file now needs one. Final sizes:
+  _factories_extras.py 412 lines, _factories_extras_small.py 112 lines. Scope is
+  tests-only: 1 modified factory, 1 new factory, 3 importers; no src or golden
+  files touched. Full unit suite and the 14-tool lint gate are green."
+target:
+  gate: uv run lint
+evidence:
+  - "Scope check: `git status --short` shows only
+    tests/runner/_factories_extras.py (M),
+    tests/runner/_factories_extras_small.py (new), and the 3 importers
+    test_lint_runner.py, test_lint_runner_integration.py,
+    test_lint_runner_stats.py (M); no src/ or tests/data/golden changes."
+  - "Pack enumeration at HEAD: `tests/runner/_factories_extras*.py` matched
+    exactly 1 module (511 lines); after split it matches 2 modules, 412 and 112
+    lines, both <= 500 with 0 `disable=too-many-lines` pragmas (was 2 at
+    :1,:6)."
+  - "Split fidelity: `diff <(git show HEAD:tests/runner/_factories_extras.py |
+    sed -n '416,511p') <(sed -n '17,112p'
+    tests/runner/_factories_extras_small.py)` =>
+    MOVED_BLOCK_IDENTICAL_96_LINES."
+  - "Behavioral parity: targeted run `uv run pytest
+    tests/runner/test_extra_tools.py tests/runner/test_extra_tools_downstream.py
+    tests/runner/test_lint_runner.py
+    tests/runner/test_lint_runner_integration.py
+    tests/runner/test_lint_runner_stats.py tests/runner/test_testing_fakes.py
+    tests/runner/test_runner_format_contract.py -q` => 264 passed, 2 deselected
+    (identical to pre-change baseline)."
+  - "Full suite: `uv run pytest -q` => 1377 passed, 13 deselected, 4
+    pre-existing warnings, 0 failures."
+  - "Golden hash-equal: `uv run pytest tests/test_golden.py -q` => 31 passed;
+    `git diff --stat -- tests/data/golden` produced no output (golden files
+    untouched)."
+  - "Format-clean: `uv run ruff format --check --config config/ruff.toml` on the
+    5 touched files => '5 files already formatted' (exit 0). `uv run ruff check
+    --config config/ruff.toml` on the same files => 'All checks passed!' (exit
+    0)."
+  - "Pylint tests rcfile: `uv run pylint --rcfile=config/.pylintrc-tests` on the
+    5 touched files => 0 messages, score 10.00 (initial wrong-import-position in
+    the new module fixed by ordering first-party import before the TYPE_CHECKING
+    block)."
+  - "Full quality gate: `uv run lint` => all 14 tools PASSED (tach, ruff format,
+    ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright
+    verify types, pylint, pylint-pyi, pylint tests, detect-secrets),
+    LINT_EXIT=0."
+notes: "Pack verification: the `tests/runner/_factories_extras*.py` glob
+  contains 1 module at HEAD and 2 after the group split; both are under the
+  configured max-module-lines=500. The moved block was copied verbatim, so all
+  parametrize IDs and data values are unchanged. Consumers in
+  test_lint_runner.py and test_lint_runner_integration.py only had their import
+  module renamed; test_lint_runner_stats.py now splits count-table imports from
+  remaining extras imports."
+concerns: []
diff --git a/tests/runner/_factories_extras.py b/tests/runner/_factories_extras.py
index 7adc178..270e4eb 100644
--- a/tests/runner/_factories_extras.py
+++ b/tests/runner/_factories_extras.py
@@ -1,9 +1,7 @@
-# pylint: disable=too-many-lines  # 502 lines — factory data for 14 tools; splitting would lose context
-"""Extra-tools, dispatch, and small parametrize tables for python-setup runner tests.
+"""Extra-tools, dispatch, and integration test data for python-setup runner tests.
 
 Moved from ``_factories.py`` to keep each file under 500 lines (pylint C0302).
 """
-# pylint: disable=too-many-lines  # test factory module; parametrized cases need space
 
 from __future__ import annotations
 
@@ -412,100 +410,3 @@ RUN_LINT_FAKE_INVARIANT_CASES: list[ParameterSet] = [
         id="package_name_none_skips_stubtest_verifytypes",
     ),
 ]
-
-# ── Small parametrize tables ──────────────────────────────────────
-
-# Print result format rows.
-PRINT_FORMAT_CASES: list[ParameterSet] = [
-    pytest.param(0, "all good\n", None, ["[mytool]", "PASSED", "all good"], id="passed"),
-    pytest.param(2, None, "error: x\n", ["FAILED", "exit=2", "error: x"], id="failed"),
-]
-
-# ``TestSortCounts`` default ordering row.
-SORT_DEFAULT_COUNTS: list[ViolationCount] = [
-    ViolationCount("tool_b", "Z001", 5),
-    ViolationCount("tool_a", "A001", 10),
-    ViolationCount("tool_a", "B001", 5),
-]
-# ``TestSortCounts`` --sort-by-rule ordering row.
-SORT_BY_RULE_COUNTS: list[ViolationCount] = [
-    ViolationCount("tool_b", "Z001", 5),
-    ViolationCount("tool_a", "A001", 10),
-    ViolationCount("tool_b", "A001", 3),
-]
-# ``TestGroupedOutput.test_group_rule_with_sort_by_rule_orders_sections`` counts row.
-GROUPED_SORT_BY_RULE_COUNTS: list[ViolationCount] = [
-    ViolationCount("tool_b", "A001", 3),
-    ViolationCount("tool_a", "A001", 10),
-    ViolationCount("tool_a", "Z001", 5),
-]
-
-# ``TestRunCmd`` rows.
-RUN_CMD_CASES: list[ParameterSet] = [
-    pytest.param(["echo", "hello"], "echo", lambda c: c == 0, "hello\n", id="success"),
-    pytest.param(["false"], "false", lambda c: c != 0, None, id="failure"),
-]
-
-# ``TestPathHelpers._find_py_files`` boundary rows.
-FIND_PY_FILES_BOUNDARY_CASES: list[ParameterSet] = [
-    pytest.param(["nonexistent_dir_xyz"], [], id="nonexistent_dir"),
-    pytest.param(
-        ["src/python_setup_lint/runner/types.py"],
-        ["src/python_setup_lint/runner/types.py"],
-        id="single_file",
-    ),
-]
-
-
-# ``TestPathHelpers._expand_globs`` rows.
-def _is_passthrough(r: list[str]) -> bool:
-    return r == ["src/python_setup_lint"]
-
-
-def _is_py_glob(r: list[str]) -> bool:
-    return bool(r) and all(f.endswith(".py") for f in r)
-
-
-def _is_empty(r: list[str]) -> bool:
-    return r == []
-
-
-EXPAND_GLOBS_CASES: list[ParameterSet] = [
-    pytest.param(["src/python_setup_lint"], _is_passthrough, id="passthrough"),
-    pytest.param(["src/**/*.py"], _is_py_glob, id="expands_glob"),
-    pytest.param(["*.nonexistent_ext_xyz"], _is_empty, id="empty_match"),
-]
-
-# ``TestStrategyBuildCommand`` stubtest+verifytypes rows.
-STRATEGY_TOKENS_CASES: list[ParameterSet] = [
-    pytest.param(
-        "mypy.stubtest",
-        "python_setup_lint",
-        ["python_setup_lint", "--concise", "--ignore-missing-stub"],
-        id="stubtest",
-    ),
-    pytest.param(
-        "pyright verify types",
-        "python_setup_lint",
-        ["python_setup_lint", "--ignoreexternal", "--outputjson"],
-        id="verifytypes",
-    ),
-]
-
-# ``TestRunLintOrchestration.test_package_name_governs_stubtest_verifytypes`` rows.
-PACKAGE_NAME_STUBTEST_CASES: list[ParameterSet] = [
-    pytest.param(None, False, -2, id="package_name_none_skips"),
-    pytest.param("python_setup_lint", True, 0, id="package_name_set_runs"),
-]
-
-# ``TestMainCLI.test_main_exit_codes`` rows.
-MAIN_EXIT_CODE_CASES: list[ParameterSet] = [
-    pytest.param(["--help"], True, id="help_exits_zero"),
-    pytest.param(["--nonexistent-flag"], False, id="unknown_flag_exits_nonzero"),
-]
-
-# ``TestRunLintIntegration.test_run_lint_baseline_capture_with_ruff`` rows.
-RUFF_BASELINE_FIX_CASES: list[ParameterSet] = [
-    pytest.param(False, "no issues", id="ruff_present_in_baseline"),
-    pytest.param(True, None, id="run_lint_fix"),
-]
diff --git a/tests/runner/_factories_extras_small.py b/tests/runner/_factories_extras_small.py
new file mode 100644
index 0000000..fee3abd
--- /dev/null
+++ b/tests/runner/_factories_extras_small.py
@@ -0,0 +1,112 @@
+"""Small parametrize tables for python-setup runner tests.
+
+Split from ``_factories_extras.py`` to keep each factory module under 500 lines (pylint C0302).
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING
+
+import pytest
+
+from python_setup_lint.runner.types import ViolationCount
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+# ── Small parametrize tables ──────────────────────────────────────
+
+# Print result format rows.
+PRINT_FORMAT_CASES: list[ParameterSet] = [
+    pytest.param(0, "all good\n", None, ["[mytool]", "PASSED", "all good"], id="passed"),
+    pytest.param(2, None, "error: x\n", ["FAILED", "exit=2", "error: x"], id="failed"),
+]
+
+# ``TestSortCounts`` default ordering row.
+SORT_DEFAULT_COUNTS: list[ViolationCount] = [
+    ViolationCount("tool_b", "Z001", 5),
+    ViolationCount("tool_a", "A001", 10),
+    ViolationCount("tool_a", "B001", 5),
+]
+# ``TestSortCounts`` --sort-by-rule ordering row.
+SORT_BY_RULE_COUNTS: list[ViolationCount] = [
+    ViolationCount("tool_b", "Z001", 5),
+    ViolationCount("tool_a", "A001", 10),
+    ViolationCount("tool_b", "A001", 3),
+]
+# ``TestGroupedOutput.test_group_rule_with_sort_by_rule_orders_sections`` counts row.
+GROUPED_SORT_BY_RULE_COUNTS: list[ViolationCount] = [
+    ViolationCount("tool_b", "A001", 3),
+    ViolationCount("tool_a", "A001", 10),
+    ViolationCount("tool_a", "Z001", 5),
+]
+
+# ``TestRunCmd`` rows.
+RUN_CMD_CASES: list[ParameterSet] = [
+    pytest.param(["echo", "hello"], "echo", lambda c: c == 0, "hello\n", id="success"),
+    pytest.param(["false"], "false", lambda c: c != 0, None, id="failure"),
+]
+
+# ``TestPathHelpers._find_py_files`` boundary rows.
+FIND_PY_FILES_BOUNDARY_CASES: list[ParameterSet] = [
+    pytest.param(["nonexistent_dir_xyz"], [], id="nonexistent_dir"),
+    pytest.param(
+        ["src/python_setup_lint/runner/types.py"],
+        ["src/python_setup_lint/runner/types.py"],
+        id="single_file",
+    ),
+]
+
+
+# ``TestPathHelpers._expand_globs`` rows.
+def _is_passthrough(r: list[str]) -> bool:
+    return r == ["src/python_setup_lint"]
+
+
+def _is_py_glob(r: list[str]) -> bool:
+    return bool(r) and all(f.endswith(".py") for f in r)
+
+
+def _is_empty(r: list[str]) -> bool:
+    return r == []
+
+
+EXPAND_GLOBS_CASES: list[ParameterSet] = [
+    pytest.param(["src/python_setup_lint"], _is_passthrough, id="passthrough"),
+    pytest.param(["src/**/*.py"], _is_py_glob, id="expands_glob"),
+    pytest.param(["*.nonexistent_ext_xyz"], _is_empty, id="empty_match"),
+]
+
+# ``TestStrategyBuildCommand`` stubtest+verifytypes rows.
+STRATEGY_TOKENS_CASES: list[ParameterSet] = [
+    pytest.param(
+        "mypy.stubtest",
+        "python_setup_lint",
+        ["python_setup_lint", "--concise", "--ignore-missing-stub"],
+        id="stubtest",
+    ),
+    pytest.param(
+        "pyright verify types",
+        "python_setup_lint",
+        ["python_setup_lint", "--ignoreexternal", "--outputjson"],
+        id="verifytypes",
+    ),
+]
+
+# ``TestRunLintOrchestration.test_package_name_governs_stubtest_verifytypes`` rows.
+PACKAGE_NAME_STUBTEST_CASES: list[ParameterSet] = [
+    pytest.param(None, False, -2, id="package_name_none_skips"),
+    pytest.param("python_setup_lint", True, 0, id="package_name_set_runs"),
+]
+
+# ``TestMainCLI.test_main_exit_codes`` rows.
+MAIN_EXIT_CODE_CASES: list[ParameterSet] = [
+    pytest.param(["--help"], True, id="help_exits_zero"),
+    pytest.param(["--nonexistent-flag"], False, id="unknown_flag_exits_nonzero"),
+]
+
+# ``TestRunLintIntegration.test_run_lint_baseline_capture_with_ruff`` rows.
+RUFF_BASELINE_FIX_CASES: list[ParameterSet] = [
+    pytest.param(False, "no issues", id="ruff_present_in_baseline"),
+    pytest.param(True, None, id="run_lint_fix"),
+]
diff --git a/tests/runner/test_lint_runner.py b/tests/runner/test_lint_runner.py
index 2c085d5..0a5933f 100644
--- a/tests/runner/test_lint_runner.py
+++ b/tests/runner/test_lint_runner.py
@@ -30,7 +30,7 @@ from python_setup_lint.runner.cmd_build import (
 from python_setup_lint.runner.output import _print_result
 from python_setup_lint.testing import fake_run_cmd_factory, make_lint_result
 from tests.runner._factories import EXPECTED_BUILTIN_TOOL_NAMES, canned_results_all_tools
-from tests.runner._factories_extras import (
+from tests.runner._factories_extras_small import (
     EXPAND_GLOBS_CASES,
     FIND_PY_FILES_BOUNDARY_CASES,
     PRINT_FORMAT_CASES,
diff --git a/tests/runner/test_lint_runner_integration.py b/tests/runner/test_lint_runner_integration.py
index d76cbe7..a947183 100644
--- a/tests/runner/test_lint_runner_integration.py
+++ b/tests/runner/test_lint_runner_integration.py
@@ -38,7 +38,7 @@ from tests.runner._factories_baseline import (
     build_current_results,
     diff_violation_kind,
 )
-from tests.runner._factories_extras import (
+from tests.runner._factories_extras_small import (
     MAIN_EXIT_CODE_CASES,
     PACKAGE_NAME_STUBTEST_CASES,
     RUFF_BASELINE_FIX_CASES,
diff --git a/tests/runner/test_lint_runner_stats.py b/tests/runner/test_lint_runner_stats.py
index ff92bb2..f4fc3ea 100644
--- a/tests/runner/test_lint_runner_stats.py
+++ b/tests/runner/test_lint_runner_stats.py
@@ -32,8 +32,10 @@ from tests.runner._factories import install_fake_runner, lint_config, runner_reg
 from tests.runner._factories_extras import (
     CLEAN_EXTRAS_PYPROJECT_BODY,
     GROUPED_OUTPUT_CASES,
-    GROUPED_SORT_BY_RULE_COUNTS,
     MALFORMATION_CASES,
+)
+from tests.runner._factories_extras_small import (
+    GROUPED_SORT_BY_RULE_COUNTS,
     SORT_BY_RULE_COUNTS,
     SORT_DEFAULT_COUNTS,
 )

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
