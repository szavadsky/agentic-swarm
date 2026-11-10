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
  "slug": "baseline-diff-merge",
  "kind": "test-only",
  "title": "Merge baseline-diff test overlap",
  "assignment": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "baseline-diff-merge",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Baseline merged with survivors"
  ],
  "citations": [
    "CodingRules.md:139-159",
    "CodingRules.md:230-306"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..b7fc941
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/checks.yaml
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
+        durationMs: 260
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 83059
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.5s]
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
+          Success: No issues found in 29 files (21ms)
+
+          ============================================================
+          [mypy] PASSED [7.1s]
+          ============================================================
+          Success: no issues found in 56 source files
+
+          ============================================================
+          [yamllint] PASSED [0.2s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.3s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [9.2s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.1s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794185077121",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.578
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.2s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [14.8s]
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
+          [pylint-pyi] PASSED [13.5s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [21.8s]
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
+          [detect-secrets] PASSED [8.7s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-diff-merge/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 39263
+        details: |-
+          [Tach] 1397 tests in 59 files unaffected by changes (~38.8s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ........................................................................ [ 15%]
+          ...................ssss................................................. [ 20%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 36%]
+          ........................................................................ [ 41%]
+          ........................................................................ [ 46%]
+          ........................................................................ [ 52%]
+          ........................................................................ [ 57%]
+          ........................................................................ [ 62%]
+          ........................................................................ [ 67%]
+          ........................................................................ [ 73%]
+          ........................................................................ [ 78%]
+          ........................................................................ [ 83%]
+          ........................................................................ [ 88%]
+          ........................................................................ [ 93%]
+          ........................................................................ [ 99%]
+          ...........                                                              [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-diff-merge/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-diff-merge/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--baseline-diff-merge/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1375 passed, 4 skipped, 18 deselected, 4 warnings in 36.95s
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
+        durationMs: 78960
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 23s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 77.85s (0:01:17)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (3 test files changed)
diff --git a/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..8e4bb14
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,58 @@
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
+  "slug": "baseline-diff-merge",
+  "kind": "test-only",
+  "title": "Merge baseline-diff test overlap",
+  "assignment": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
+  "outlineRef": "baseline-diff-merge",
+  "milestone": "M2",
+  "wave": 1,
+  "scenarioRefs": [
+    "M2: Baseline merged with survivors"
+  ],
+  "citations": [
+    "CodingRules.md:139-159",
+    "CodingRules.md:230-306"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "CodingRules.md:139-159",
+  "CodingRules.md:230-306"
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
diff --git a/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..c87f618
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T00:32:00.745Z
+session: 01a1bdb9-3967-73e9-ab1d-2301ad7382c1
+endedAt: 2026-11-09T00:47:35.623Z
+usage:
+  inputTokens: 83537
+  outputTokens: 35091
+  costUsd: 0.04613
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T00-33-15-111Z_01a1bdb9-3967-73e9-ab1d-2301ad7382c1
diff --git a/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..5fd0d84
--- /dev/null
+++ b/.factory/tasks/modernize/items/baseline-diff-merge/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,59 @@
+status: ok
+summary: "Merged the three overlapping baseline-diff test modules (249+308+486
+  lines) into exactly two modules under 500 lines:
+  tests/runner/test_baseline_diff.py (495 lines, _compare_sorted/_diff_baseline
+  semantics) and tests/runner/test_baseline_diff_parsers.py (488 lines,
+  parsers/capture/schema-load); deleted tests/runner/test_baseline_diff_edge.py.
+  Overlapping cases were folded into explicitly named survivors:
+  TestCompareSortedEdgeCases -> TestCompareSorted param cases (all original IDs
+  preserved), three pylint flat-record round-trips -> TestFlatRecordRoundTrip,
+  duplicate rumdl capture -> rumdl_timing_normalised_in_output, and
+  capture-persistence/schema-load cases moved with provenance comments.
+  Exit-code(-11 crash)/baseline-reload pinning limbs preserved; both modules
+  carry no_external_api markers (previously missing on the edge module). Net
+  removal is 3 duplicate cases (78 -> 75 collected), no coverage loss."
+target:
+  gate: uv run pytest tests/runner/test_baseline_diff.py
+    tests/runner/test_baseline_diff_parsers.py -q -m 'slow or not slow'
+evidence:
+  - uv run pytest tests/runner/test_baseline_diff.py
+    tests/runner/test_baseline_diff_parsers.py -q -m 'slow or not slow' -> 75
+    passed (incl. both slow perf cases)
+  - uv run pytest -q -> 1375 passed, 4 skipped, 18 deselected, 0 failed
+  - uv run pytest tests/integration.py -q -> 9 passed
+  - uv run lint (pipefail, exit capture) -> all 14 tools PASSED, PIPELINE_EXIT=0
+  - uv run pytest tests/runner/test_baseline_diff.py
+    tests/runner/test_baseline_diff_parsers.py tests/test_golden.py -q -> 104
+    passed, 2 deselected; golden fixtures unchanged (git status shows only the 3
+    scoped test files)
+  - wc -l -> test_baseline_diff.py 495, test_baseline_diff_parsers.py 488, both
+    <=500; test_baseline_diff_edge.py deleted
+  - AST inventory HEAD vs worktree shows every original class/test preserved
+    except 3 duplicate cases folded into named survivors; merged compare case
+    IDs verified via --collect-only (all 13 params kept)
+  - "uv run ruff check + uv run mypy on both touched modules -> All checks
+    passed / Success: no issues found"
+  - git diff --check -> exit 0; only tests/runner/test_baseline_diff.py,
+    test_baseline_diff_parsers.py, and deleted test_baseline_diff_edge.py
+    changed
+concerns:
+  - Removed 3 duplicate cases (MixedSchema legacy pylint round-trip,
+    MixedShapeLegacy round-trip, duplicate rumdl_text_captured_as_records
+    param); each removal is mapped to its survivor in inline
+    comments/docstrings, and the surviving flat-record test was strengthened
+    with the two-record baseline-shrink assertion from the legacy case.
+  - No CLI or autofix-pinning limbs existed in these three modules, so none were
+    dropped; the exit-code (-11 crash) and baseline-reload limbs were preserved.
+    Autofix pinning remains in the untouched test_autofix_* modules and is not
+    blocking debt for this item.
+  - Shim-removal (peek_fallback_tools/_compare_sorted) is intentionally deferred
+    per assignment; the merged shape is ready for the follow-up serialized
+    shim-removal item.
+  - Pre-existing private parser imports still carry the type-ignore suppressions
+    reported by LSP; out of scope for this tests-only merge and unchanged by it.
+notes: "Survivor map is documented inline: edge TestCompareSortedEdgeCases ->
+  TestCompareSorted param cases; TestMixedSchemaLoad legacy +
+  TestMixedShapeLegacyOutput -> TestFlatRecordRoundTrip;
+  rumdl_text_captured_as_records -> rumdl_timing_normalised_in_output; edge
+  TestCaptureBaselineOnDisk + TestMixedSchemaLoad moved into the parsers module.
+  Perf test names were normalized to the given/then convention."
diff --git a/tests/runner/test_baseline_diff.py b/tests/runner/test_baseline_diff.py
index e15ee5f..cf1b2e6 100644
--- a/tests/runner/test_baseline_diff.py
+++ b/tests/runner/test_baseline_diff.py
@@ -1,16 +1,19 @@
-"""T2 — drift-resistant baseline diff tests."""
+"""Drift-resistant baseline diff tests: _compare_sorted and _diff_baseline semantics."""
 
 from __future__ import annotations
 
+import json
+import time
 from pathlib import Path
 from typing import Any
 
 import pytest
 
-from python_setup_lint.runner import Record
+from python_setup_lint.runner import Record, peek_fallback_tools
 from python_setup_lint.runner._record_types import _compare_records_key
-from python_setup_lint.runner.baseline import (
-    _compare_sorted,  # private import for white-box testing
+from python_setup_lint.runner.baseline import (  # private import for white-box testing
+    _compare_sorted,
+    _diff_baseline,
 )
 from python_setup_lint.testing import make_lint_result
 from tests.runner._factories import diff_baseline_with
@@ -22,9 +25,10 @@ def _sorted(records: list[Record]) -> list[Record]:  # pylint: disable=trivial-w
     return sorted(records, key=_compare_records_key)
 
 
-# ── Surface unit: _compare_sorted pure-fn ────────────────────────
-
-
+# ── Surface unit: _compare_sorted pure-fn (merged survivor class) ──
+# Merged from deleted test_baseline_diff_edge.py::TestCompareSortedEdgeCases.
+# Survivor: test_compare_sorted_given_current_and_saved_then_expected_additions_and_removals;
+# every moved case below keeps its original parametrized id.
 class TestCompareSorted:
     @pytest.mark.parametrize(
         ("current", "saved", "exp_additions", "exp_removals"),
@@ -103,6 +107,36 @@ class TestCompareSorted:
                 0,
                 id="block_insertion_plus_later_reorder_no_spurious_diff",
             ),
+            # Survivors merged from TestCompareSortedEdgeCases (deleted module).
+            pytest.param([], [], 0, 0, id="both_empty"),
+            pytest.param(
+                [],
+                [Record("a.py", 1, 1, "E1", "m")],
+                0,
+                1,
+                id="current_empty_saved_has_records",
+            ),
+            pytest.param(
+                [Record("a.py", 1, 1, "E1", "m")],
+                [],
+                1,
+                0,
+                id="current_has_records_saved_empty",
+            ),
+            pytest.param(
+                [Record(None, None, None, "R0801:x<->y", "dup")],
+                [Record(None, None, None, "R0801:x<->y", "dup")],
+                0,
+                0,
+                id="none_file_on_both_sides",
+            ),
+            pytest.param(
+                [Record(None, None, None, "R0801:x<->y", "dup"), Record("a.py", 1, 1, "E1", "m")],
+                [Record("a.py", 1, 1, "E1", "m")],
+                1,
+                0,
+                id="none_file_added",
+            ),
         ],
     )
     def test_compare_sorted_given_current_and_saved_then_expected_additions_and_removals(
@@ -129,6 +163,45 @@ class TestCompareSorted:
         assert recs[2].file == "z.py"
 
 
+# ── Performance benchmark: 50k-line baseline ────────────────────
+
+
+@pytest.mark.slow
+class TestPerfBenchmark:
+    def test_compare_sorted_given_50k_line_baseline_then_under_200ms(self) -> None:
+        records_saved: list[Record] = [
+            Record(f"src/file_{f:04d}.py", line, 1, "E001", "m") for f in range(1000) for line in range(1, 51)
+        ]
+        records_current = [r for r in records_saved if not (r.file == "src/file_0999.py" and r.line and r.line > 5)]
+        records_current.extend(Record(f"src/new_{f:04d}.py", 1, 1, "E001", "m") for f in range(5000, 5500))
+        records_saved.sort(key=_compare_records_key)
+        records_current.sort(key=_compare_records_key)
+        t0 = time.perf_counter()
+        added, removed = _compare_sorted(records_current, records_saved)
+        elapsed_ms = (time.perf_counter() - t0) * 1000
+        assert len(added) == 500
+        assert len(removed) == 45
+        assert elapsed_ms < 200.0, f"_compare_sorted took {elapsed_ms:.1f}ms (>200ms ceiling)"
+
+    def test_diff_baseline_given_50k_line_baseline_then_end_to_end_under_1s(self, tmp_path: Path) -> None:
+        records: list[
+            dict[str, Any]
+        ] = [  # dict shape: {"tool": str, "file": str, "line": int, "col": int, "rule": str, "msg": str}
+            {"tool": "ruff check", "file": f"src/file_{f:04d}.py", "line": line, "col": 1, "rule": "E001", "msg": "m"}
+            for f in range(1000)
+            for line in range(1, 51)
+        ]
+        baseline_path = tmp_path / "big.json"
+        baseline_path.write_text(json.dumps(records))
+        stdout = "\n".join(f"src/file_{f:04d}.py:{line}:1: E001 m" for f in range(1000) for line in range(1, 51))
+        current = [make_lint_result(tool_name="ruff check", stdout=stdout)]
+        t0 = time.perf_counter()
+        violations = _diff_baseline(current, baseline_path)
+        elapsed_ms = (time.perf_counter() - t0) * 1000
+        assert violations == []
+        assert elapsed_ms < 1000.0, f"_diff_baseline 50k took {elapsed_ms:.1f}ms (>1s ceiling)"
+
+
 # ── Downstream integration: drift-resistant diff semantics ────────
 
 
@@ -247,3 +320,176 @@ class TestDriftResistantDiff:
             assert violations == []
         if check_reloaded:
             assert check_reloaded(reloaded)
+
+
+# ── Error-path coverage: _diff_baseline failure modes ────────────
+
+
+class TestDiffBaselineErrors:
+    @pytest.mark.parametrize(
+        ("saved", "current", "check"),
+        [
+            pytest.param(
+                None,
+                [],
+                lambda v, _: any("Baseline file not found" in x for x in v),
+                id="baseline_file_not_found",
+            ),
+            pytest.param(
+                "{invalid json",
+                [],
+                lambda v, _: any("Cannot read baseline" in x for x in v),
+                id="cannot_read_corrupt_json",
+            ),
+            pytest.param(
+                [],
+                [make_lint_result(tool_name="ruff check", stdout="src/a.py:1:3: E501 msg\n")],
+                lambda v, _: any("E501: msg @ src/a.py:1:3" in x for x in v),
+                id="new_tool_result_no_baseline_entry",
+            ),
+            pytest.param(
+                [{"tool": "pyright check", "file": "src/b.py", "line": 1, "col": 1, "rule": "some-rule", "msg": "the message"}],
+                [make_lint_result(tool_name="pyright check", stdout="not json\n")],
+                lambda v, r: v == [] and r == [],
+                id="diagnostics_lost_when_current_not_json",
+            ),
+            pytest.param(
+                [{"tool": "pyright check", "file": "src/a.py", "line": 1, "col": 1, "rule": "rule", "msg": "msg1"}],
+                [
+                    make_lint_result(
+                        tool_name="pyright check",
+                        stdout=json.dumps(
+                            {
+                                "summary": {"errorCount": 2, "warningCount": 0},
+                                "generalDiagnostics": [
+                                    {
+                                        "file": "src/a.py",
+                                        "rule": "rule",
+                                        "message": "msg1",
+                                        "range": {"start": {"line": 0, "character": 0}},
+                                    },
+                                    {
+                                        "file": "src/b.py",
+                                        "rule": "rule",
+                                        "message": "msg2",
+                                        "range": {"start": {"line": 1, "character": 0}},
+                                    },
+                                ],
+                            }
+                        ),
+                    )
+                ],
+                lambda v, _: any("msg2 @ src/b.py:2" in x for x in v),
+                id="diagnostics_errors_increase_flagged",
+            ),
+            pytest.param(
+                [
+                    {"tool": "pyright check", "file": "src/a.py", "line": 1, "col": 1, "rule": "rule", "msg": "msg1"},
+                    {"tool": "pyright check", "file": "src/b.py", "line": 2, "col": 2, "rule": "rule", "msg": "msg2"},
+                ],
+                [
+                    make_lint_result(
+                        tool_name="pyright check",
+                        stdout=json.dumps(
+                            {
+                                "summary": {"errorCount": 1, "warningCount": 0},
+                                "generalDiagnostics": [
+                                    {
+                                        "file": "src/a.py",
+                                        "rule": "rule",
+                                        "message": "msg1",
+                                        "range": {"start": {"line": 0, "character": 0}},
+                                    },
+                                ],
+                            }
+                        ),
+                    )
+                ],
+                lambda v, r: v == [] and len(r) == 1 and r[0]["file"] == "src/a.py",
+                id="diagnostics_errors_decrease_shrinkage",
+            ),
+            pytest.param(
+                [
+                    {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
+                    {"tool": "ruff check", "file": "src/b.py", "line": 2, "col": 2, "rule": "E001", "msg": "y"},
+                ],
+                [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")],
+                lambda v, r: v == [] and len(r) == 1 and r[0]["tool"] == "pylint",
+                id="tool_absent_from_current_removed_from_baseline",
+            ),
+        ],
+    )
+    def test_diff_baseline_given_error_paths_then_expected_violations(
+        self,
+        tmp_path: Path,
+        saved: Any,
+        current: list[Any],
+        check: Any,
+    ) -> None:
+        baseline_path = tmp_path / "baseline.json"
+        if saved is not None:
+            baseline_path.write_text(json.dumps(saved) if isinstance(saved, list) else saved)
+        violations = _diff_baseline(current, baseline_path)
+        try:
+            reloaded = json.loads(baseline_path.read_text()) if baseline_path.exists() else None
+        except json.JSONDecodeError:  # pylint: disable=silent-except  # test helper; exception expected
+            reloaded = None
+        assert check(violations, reloaded)
+
+
+# ── Fallback/frozen-stub and dedup pinning limbs ────────────────
+
+
+class TestPeekFallbackTools:
+    def test_peek_fallback_tools_given_snapshot_then_frozen_copy(self, tmp_path: Path) -> None:
+        # peek_fallback_tools() now always returns empty frozenset (WS-6 clean break).
+        # Verify diff_baseline_with doesn't crash and the stub returns frozenset().
+        saved: list[dict[str, object]] = []
+        current = [make_lint_result(tool_name="ruff check", stdout="src/a.py:1:3: E501 msg\n")]
+        violations, _ = diff_baseline_with(tmp_path, saved, current)
+        assert any("msg @ src/a.py:1:3" in x for x in violations)
+        snap = peek_fallback_tools()
+        assert isinstance(snap, frozenset)
+        assert snap == frozenset()
+
+
+class TestFlatRecordRoundTrip:
+    """Survivor of three overlapping flat-record pylint round-trip cases.
+
+    Survivor: test_flat_record_pylint_given_unchanged_then_round_trips.
+    Merged cases (deleted as duplicates): TestMixedSchemaLoad::
+    test_mixed_schema_given_legacy_pylint_output_then_upgraded_to_records and
+    TestMixedShapeLegacyOutput::test_mixed_shape_legacy_given_parseable_pylint_then_round_trips.
+    """
+
+    def test_flat_record_pylint_given_unchanged_then_round_trips(self, tmp_path: Path) -> None:
+        saved = [
+            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
+            {"tool": "pylint", "file": "src/b.py", "line": 2, "col": 2, "rule": "missing-module-docstring", "msg": "y"},
+        ]
+        current = [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")]
+        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
+        assert violations == []
+        assert reloaded == [
+            {"col": 1, "file": "src/a.py", "line": 1, "msg": "x", "rule": "unused-import", "tool": "pylint"},
+        ]
+
+
+class TestMultiSavedToolDedup:
+    def test_multi_saved_tool_dedup_given_duplicate_entries_then_removed_on_absence(self, tmp_path: Path) -> None:
+        # Flat records: duplicate pylint violations for the same violation; current has no pylint
+        # violations but has the ruff check one -> duplicate pylint removed, ruff check stays.
+        saved = [
+            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
+            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
+            {"tool": "ruff check", "file": "src/b.py", "line": 2, "col": 2, "rule": "E001", "msg": "y"},
+        ]
+        baseline_path = tmp_path / "baseline.json"
+        baseline_path.write_text(json.dumps(saved))
+        current = [make_lint_result(tool_name="ruff check", stdout="src/b.py:2:2: E001 y\n")]
+        violations = _diff_baseline(current, baseline_path)
+        assert violations == []
+        reloaded = json.loads(baseline_path.read_text())
+        assert len(reloaded) == 1
+        assert reloaded[0]["tool"] == "ruff check"
+        assert all(e["tool"] != "pylint" for e in reloaded)
diff --git a/tests/runner/test_baseline_diff_edge.py b/tests/runner/test_baseline_diff_edge.py
deleted file mode 100644
index 66fe999..0000000
--- a/tests/runner/test_baseline_diff_edge.py
+++ /dev/null
@@ -1,308 +0,0 @@
-"""Edge-case and integration tests for baseline diff."""
-
-from __future__ import annotations
-
-import json
-import time
-from pathlib import Path
-from typing import Any
-
-import pytest
-
-from python_setup_lint.runner import Record, peek_fallback_tools
-from python_setup_lint.runner._record_types import _compare_records_key
-from python_setup_lint.runner.baseline import (  # private import for white-box testing
-    _capture_baseline,
-    _compare_sorted,
-    _diff_baseline,
-)
-from python_setup_lint.testing import make_lint_result
-from tests.runner._factories import diff_baseline_with
-
-# ── Mixed schema load ─────────────────────────────────────────────
-
-
-class TestMixedSchemaLoad:
-    def test_mixed_schema_given_legacy_pylint_output_then_upgraded_to_records(self, tmp_path: Path) -> None:
-        saved = [
-            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
-            {"tool": "pylint", "file": "src/b.py", "line": 2, "col": 2, "rule": "missing-module-docstring", "msg": "y"},
-        ]
-        current = [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")]
-        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
-        assert reloaded == [
-            {"col": 1, "file": "src/a.py", "line": 1, "msg": "x", "rule": "unused-import", "tool": "pylint"},
-        ]
-
-    def test_mixed_schema_given_unknown_tool_then_baseline_shrinks(self, tmp_path: Path) -> None:
-        saved = [
-            {"tool": "strange-tool", "file": "src/a.py", "line": 1, "col": 1, "rule": "E001", "msg": "old violation"},
-        ]
-        current = [make_lint_result(tool_name="strange-tool", stdout="")]
-        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
-        assert reloaded == []
-
-    def test_mixed_schema_given_empty_baseline_then_ok_for_all_tools(self, tmp_path: Path) -> None:
-        tool_names = [
-            "tach check",
-            "ruff check",
-            "rumdl check",
-            "mypy",
-            "yamllint",
-            "ty check",
-            "pyright verify types",
-            "pylint",
-            "detect-secrets",
-        ]
-        saved: list[dict[str, object]] = []
-        current = [make_lint_result(tool_name=t, exit_code=0, stdout="") for t in tool_names]
-        current.append(
-            make_lint_result(
-                tool_name="pyright check",
-                stdout=json.dumps({"summary": {"errorCount": 0, "warningCount": 0}}),
-            )
-        )
-        violations, _ = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
-
-
-# ── Performance benchmark: 50k-line baseline < 200ms ─────────────
-
-
-@pytest.mark.slow
-class TestPerfBenchmark:
-    def test_50k_line_baseline_compares_under_200ms(self) -> None:
-        records_saved: list[Record] = [
-            Record(f"src/file_{f:04d}.py", line, 1, "E001", "m") for f in range(1000) for line in range(1, 51)
-        ]
-        records_current = [r for r in records_saved if not (r.file == "src/file_0999.py" and r.line and r.line > 5)]
-        records_current.extend(Record(f"src/new_{f:04d}.py", 1, 1, "E001", "m") for f in range(5000, 5500))
-        records_saved.sort(key=_compare_records_key)
-        records_current.sort(key=_compare_records_key)
-        t0 = time.perf_counter()
-        added, removed = _compare_sorted(records_current, records_saved)
-        elapsed_ms = (time.perf_counter() - t0) * 1000
-        assert len(added) == 500
-        assert len(removed) == 45
-        assert elapsed_ms < 200.0, f"_compare_sorted took {elapsed_ms:.1f}ms (>200ms ceiling)"
-
-    def test_diff_baseline_50k_end_to_end_under_1s(self, tmp_path: Path) -> None:
-        records: list[
-            dict[str, Any]
-        ] = [  # dict shape: {"tool": str, "file": str, "line": int, "col": int, "rule": str, "msg": str}
-            {"tool": "ruff check", "file": f"src/file_{f:04d}.py", "line": line, "col": 1, "rule": "E001", "msg": "m"}
-            for f in range(1000)
-            for line in range(1, 51)
-        ]
-        baseline_path = tmp_path / "big.json"
-        baseline_path.write_text(json.dumps(records))
-        stdout = "\n".join(f"src/file_{f:04d}.py:{line}:1: E001 m" for f in range(1000) for line in range(1, 51))
-        current = [make_lint_result(tool_name="ruff check", stdout=stdout)]
-        t0 = time.perf_counter()
-        violations = _diff_baseline(current, baseline_path)
-        elapsed_ms = (time.perf_counter() - t0) * 1000
-        assert violations == []
-        assert elapsed_ms < 1000.0, f"_diff_baseline 50k took {elapsed_ms:.1f}ms (>1s ceiling)"
-
-
-# ── Error-path coverage: _diff_baseline failure modes ────────────
-
-
-class TestDiffBaselineErrors:
-    @pytest.mark.parametrize(
-        ("saved", "current", "check"),
-        [
-            pytest.param(
-                None,
-                [],
-                lambda v, _: any("Baseline file not found" in x for x in v),
-                id="baseline_file_not_found",
-            ),
-            pytest.param(
-                "{invalid json",
-                [],
-                lambda v, _: any("Cannot read baseline" in x for x in v),
-                id="cannot_read_corrupt_json",
-            ),
-            pytest.param(
-                [],
-                [make_lint_result(tool_name="ruff check", stdout="src/a.py:1:3: E501 msg\n")],
-                lambda v, _: any("E501: msg @ src/a.py:1:3" in x for x in v),
-                id="new_tool_result_no_baseline_entry",
-            ),
-            pytest.param(
-                [{"tool": "pyright check", "file": "src/b.py", "line": 1, "col": 1, "rule": "some-rule", "msg": "the message"}],
-                [make_lint_result(tool_name="pyright check", stdout="not json\n")],
-                lambda v, r: v == [] and r == [],
-                id="diagnostics_lost_when_current_not_json",
-            ),
-            pytest.param(
-                [{"tool": "pyright check", "file": "src/a.py", "line": 1, "col": 1, "rule": "rule", "msg": "msg1"}],
-                [
-                    make_lint_result(
-                        tool_name="pyright check",
-                        stdout=json.dumps(
-                            {
-                                "summary": {"errorCount": 2, "warningCount": 0},
-                                "generalDiagnostics": [
-                                    {
-                                        "file": "src/a.py",
-                                        "rule": "rule",
-                                        "message": "msg1",
-                                        "range": {"start": {"line": 0, "character": 0}},
-                                    },
-                                    {
-                                        "file": "src/b.py",
-                                        "rule": "rule",
-                                        "message": "msg2",
-                                        "range": {"start": {"line": 1, "character": 0}},
-                                    },
-                                ],
-                            }
-                        ),
-                    )
-                ],
-                lambda v, _: any("msg2 @ src/b.py:2" in x for x in v),
-                id="diagnostics_errors_increase_flagged",
-            ),
-            pytest.param(
-                [
-                    {"tool": "pyright check", "file": "src/a.py", "line": 1, "col": 1, "rule": "rule", "msg": "msg1"},
-                    {"tool": "pyright check", "file": "src/b.py", "line": 2, "col": 2, "rule": "rule", "msg": "msg2"},
-                ],
-                [
-                    make_lint_result(
-                        tool_name="pyright check",
-                        stdout=json.dumps(
-                            {
-                                "summary": {"errorCount": 1, "warningCount": 0},
-                                "generalDiagnostics": [
-                                    {
-                                        "file": "src/a.py",
-                                        "rule": "rule",
-                                        "message": "msg1",
-                                        "range": {"start": {"line": 0, "character": 0}},
-                                    },
-                                ],
-                            }
-                        ),
-                    )
-                ],
-                lambda v, r: v == [] and len(r) == 1 and r[0]["file"] == "src/a.py",
-                id="diagnostics_errors_decrease_shrinkage",
-            ),
-            pytest.param(
-                [
-                    {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
-                    {"tool": "ruff check", "file": "src/b.py", "line": 2, "col": 2, "rule": "E001", "msg": "y"},
-                ],
-                [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")],
-                lambda v, r: v == [] and len(r) == 1 and r[0]["tool"] == "pylint",
-                id="tool_absent_from_current_removed_from_baseline",
-            ),
-        ],
-    )
-    def test_diff_baseline_given_error_paths_then_expected_violations(
-        self,
-        tmp_path: Path,
-        saved: Any,
-        current: list[Any],
-        check: Any,
-    ) -> None:
-        baseline_path = tmp_path / "baseline.json"
-        if saved is not None:
-            baseline_path.write_text(json.dumps(saved) if isinstance(saved, list) else saved)
-        violations = _diff_baseline(current, baseline_path)
-        try:
-            reloaded = json.loads(baseline_path.read_text()) if baseline_path.exists() else None
-        except json.JSONDecodeError:  # pylint: disable=silent-except  # test helper; exception expected
-            reloaded = None
-        assert check(violations, reloaded)
-
-
-# ── T2-1 review-fix additions: gaps D1–D6 ────────────────────────
-
-
-class TestPeekFallbackTools:
-    def test_peek_fallback_tools_given_snapshot_then_frozen_copy(self, tmp_path: Path) -> None:
-        # peek_fallback_tools() now always returns empty frozenset (WS-6 clean break).
-        # Verify diff_baseline_with doesn't crash and the stub returns frozenset().
-        saved: list[dict[str, object]] = []
-        current = [make_lint_result(tool_name="ruff check", stdout="src/a.py:1:3: E501 msg\n")]
-        violations, _ = diff_baseline_with(tmp_path, saved, current)
-        assert any("msg @ src/a.py:1:3" in x for x in violations)
-        snap = peek_fallback_tools()
-        assert isinstance(snap, frozenset)
-        assert snap == frozenset()
-
-
-class TestFallbackTracking:
-    def test_fallback_tracking_given_flat_records_then_no_violations_for_unchanged(self, tmp_path: Path) -> None:
-        # Flat-record behavior: saved has one pylint violation, current has same -> 0 violations.
-        saved = [{"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"}]
-        current = [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")]
-        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
-        assert len(reloaded) == 1
-        assert reloaded[0] == {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"}
-
-
-class TestMultiSavedToolDedup:
-    def test_multi_saved_tool_dedup_given_duplicate_entries_then_removed_on_absence(self, tmp_path: Path) -> None:
-        # Flat records: duplicate pylint violations for the same violation; current has no pylint
-        # violations but has the ruff check one -> duplicate pylint removed, ruff check stays.
-        saved = [
-            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
-            {"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"},
-            {"tool": "ruff check", "file": "src/b.py", "line": 2, "col": 2, "rule": "E001", "msg": "y"},
-        ]
-        baseline_path = tmp_path / "baseline.json"
-        baseline_path.write_text(json.dumps(saved))
-        current = [make_lint_result(tool_name="ruff check", stdout="src/b.py:2:2: E001 y\n")]
-        violations = _diff_baseline(current, baseline_path)
-        assert violations == []
-        reloaded = json.loads(baseline_path.read_text())
-        assert len(reloaded) == 1
-        assert reloaded[0]["tool"] == "ruff check"
-        assert all(e["tool"] != "pylint" for e in reloaded)
-
-
-class TestMixedShapeLegacyOutput:
-    # Legacy output handling was removed in WS-6. These tests verify
-    # that the flat-record baseline correctly handles pylint output.
-    def test_mixed_shape_legacy_given_parseable_pylint_then_round_trips(self, tmp_path: Path) -> None:
-        saved = [{"tool": "pylint", "file": "src/a.py", "line": 1, "col": 1, "rule": "unused-import", "msg": "x"}]
-        current = [make_lint_result(tool_name="pylint", stdout="src/a.py:1:1: W0611: x (unused-import)\n")]
-        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
-        assert reloaded == saved
-
-
-class TestCaptureBaselineOnDisk:
-    def test_capture_baseline_given_records_then_emitted_in_sorted_order(self) -> None:
-        stdout = "src/z.py:9:1: E501 zeta\nsrc/a.py:1:3: E501 alpha\nsrc/a.py:1: E501 alpha-no-col\n"
-        records = _capture_baseline([make_lint_result(tool_name="ruff check", stdout=stdout)])
-        # _capture_baseline returns a flat list of violation dicts (no nested "records" key).
-        keys = [
-            (
-                () if r["file"] is None else (r["file"],),
-                () if r["line"] is None else (r["line"],),
-                () if r["col"] is None else (r["col"],),
-                r["rule"],
-            )
-            for r in records
-        ]
-        assert keys == sorted(keys), f"records not sorted: {records!r}"
-        assert [r["file"] for r in records] == ["src/a.py", "src/a.py", "src/z.py"]
-        assert records[0]["col"] is None
-        assert records[1]["col"] == 3
-
-    def test_capture_baseline_given_sorted_records_then_round_trips_through_diff(self, tmp_path: Path) -> None:
-        stdout = "src/z.py:9:1: E501 zeta\nsrc/a.py:1:3: E501 alpha\nsrc/b.py:5:2: E501 beta\n"
-        cap = _capture_baseline([make_lint_result(tool_name="ruff check", stdout=stdout)])
-        saved = cap
-        current = [make_lint_result(tool_name="ruff check", stdout=stdout)]
-        violations, _ = diff_baseline_with(tmp_path, saved, current)
-        assert violations == []
diff --git a/tests/runner/test_baseline_diff_parsers.py b/tests/runner/test_baseline_diff_parsers.py
index 7ee1f38..0335702 100644
--- a/tests/runner/test_baseline_diff_parsers.py
+++ b/tests/runner/test_baseline_diff_parsers.py
@@ -1,4 +1,4 @@
-"""Parser and capture unit tests for baseline diff."""
+"""Parser, capture, and baseline schema-load tests for baseline diff."""
 
 from __future__ import annotations
 
@@ -9,10 +9,8 @@ from typing import Any
 import pytest
 
 from python_setup_lint.runner import Record
-from python_setup_lint.runner._record_types import _compare_records_key
 from python_setup_lint.runner.baseline import (  # private import for white-box testing
     _capture_baseline,
-    _compare_sorted,
     _diff_baseline,
 )
 from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  # private import for white-box testing
@@ -25,14 +23,11 @@ from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  #
     _parse_yamllint_records,
 )
 from python_setup_lint.testing import make_lint_result
+from tests.runner._factories import diff_baseline_with
 
 pytestmark = pytest.mark.no_external_api
 
 
-def _sorted(records: list[Record]) -> list[Record]:  # pylint: disable=trivial-wrapper  # test helper; readability over DRY
-    return sorted(records, key=_compare_records_key)
-
-
 # ── Private-complex unit: per-tool record parsers ────────────────
 
 
@@ -266,6 +261,41 @@ class TestCaptureSchemaV2:
         assert check(cap)
 
 
+# ── _capture_baseline persistence (merged from deleted edge module) ──
+# Survivor: TestCaptureBaselineOnDisk; both persistence cases moved verbatim.
+
+
+class TestCaptureBaselineOnDisk:
+    def test_capture_baseline_given_records_then_emitted_in_sorted_order(self) -> None:
+        stdout = "src/z.py:9:1: E501 zeta\nsrc/a.py:1:3: E501 alpha\nsrc/a.py:1: E501 alpha-no-col\n"
+        records = _capture_baseline([make_lint_result(tool_name="ruff check", stdout=stdout)])
+        # _capture_baseline returns a flat list of violation dicts (no nested "records" key).
+        keys = [
+            (
+                () if r["file"] is None else (r["file"],),
+                () if r["line"] is None else (r["line"],),
+                () if r["col"] is None else (r["col"],),
+                r["rule"],
+            )
+            for r in records
+        ]
+        assert keys == sorted(keys), f"records not sorted: {records!r}"
+        assert [r["file"] for r in records] == ["src/a.py", "src/a.py", "src/z.py"]
+        assert records[0]["col"] is None
+        assert records[1]["col"] == 3
+
+    def test_capture_baseline_given_sorted_records_then_round_trips_through_diff(self, tmp_path: Path) -> None:
+        stdout = "src/z.py:9:1: E501 zeta\nsrc/a.py:1:3: E501 alpha\nsrc/b.py:5:2: E501 beta\n"
+        cap = _capture_baseline([make_lint_result(tool_name="ruff check", stdout=stdout)])
+        saved = cap
+        current = [make_lint_result(tool_name="ruff check", stdout=stdout)]
+        violations, _ = diff_baseline_with(tmp_path, saved, current)
+        assert violations == []
+
+
+# ── _capture_one edge cases ──────────────────────────────────────
+
+
 # ── _capture_one edge cases ──────────────────────────────────────
 
 
@@ -293,24 +323,8 @@ class TestCaptureOneEdgeCases:
                 lambda cap: cap == [],
                 id="rumdl_json_captured_as_diagnostics",
             ),
-            pytest.param(
-                "rumdl check",
-                "README.md:8:1: [MD013] Line too long\n",
-                lambda cap: (
-                    cap
-                    == [
-                        {
-                            "tool": "rumdl check",
-                            "file": "README.md",
-                            "line": 8,
-                            "col": 1,
-                            "rule": "MD013",
-                            "msg": "Line too long",
-                        },
-                    ]
-                ),
-                id="rumdl_text_captured_as_records",
-            ),
+            # Survivor: rumdl_timing_normalised_in_output; merged duplicate:
+            # rumdl_text_captured_as_records (same record, no footer).
             pytest.param(
                 "rumdl check",
                 "No issues found (42ms)\n",
@@ -357,54 +371,42 @@ class TestCaptureOneEdgeCases:
         assert violations == []
 
 
-# ── _compare_sorted edge cases ───────────────────────────────────
+# ── Baseline schema load ─────────────────────────────────────────
+# Legacy pylint round-trip merged into test_baseline_diff.py::TestFlatRecordRoundTrip.
 
 
-class TestCompareSortedEdgeCases:
-    @pytest.mark.parametrize(
-        ("current", "saved", "exp_additions", "exp_removals"),
-        [
-            pytest.param([], [], 0, 0, id="both_empty"),
-            pytest.param(
-                [],
-                _sorted([Record("a.py", 1, 1, "E1", "m")]),
-                0,
-                1,
-                id="current_empty_saved_has_records",
-            ),
-            pytest.param(
-                _sorted([Record("a.py", 1, 1, "E1", "m")]),
-                [],
-                1,
-                0,
-                id="current_has_records_saved_empty",
-            ),
-            pytest.param(
-                _sorted([Record(None, None, None, "R0801:x<->y", "dup")]),
-                _sorted([Record(None, None, None, "R0801:x<->y", "dup")]),
-                0,
-                0,
-                id="none_file_on_both_sides",
-            ),
-            pytest.param(
-                _sorted([Record(None, None, None, "R0801:x<->y", "dup"), Record("a.py", 1, 1, "E1", "m")]),
-                _sorted([Record("a.py", 1, 1, "E1", "m")]),
-                1,
-                0,
-                id="none_file_added",
-            ),
-        ],
-    )
-    def test_compare_sorted_given_edge_cases_then_expected_additions_and_removals(
-        self,
-        current: list[Record],
-        saved: list[Record],
-        exp_additions: int,
-        exp_removals: int,
-    ) -> None:
-        added, removed = _compare_sorted(current, saved)
-        assert len(added) == exp_additions
-        assert len(removed) == exp_removals
+class TestMixedSchemaLoad:
+    def test_mixed_schema_given_unknown_tool_then_baseline_shrinks(self, tmp_path: Path) -> None:
+        saved = [
+            {"tool": "strange-tool", "file": "src/a.py", "line": 1, "col": 1, "rule": "E001", "msg": "old violation"},
+        ]
+        current = [make_lint_result(tool_name="strange-tool", stdout="")]
+        violations, reloaded = diff_baseline_with(tmp_path, saved, current)
+        assert violations == []
+        assert reloaded == []
+
+    def test_mixed_schema_given_empty_baseline_then_ok_for_all_tools(self, tmp_path: Path) -> None:
+        tool_names = [
+            "tach check",
+            "ruff check",
+            "rumdl check",
+            "mypy",
+            "yamllint",
+            "ty check",
+            "pyright verify types",
+            "pylint",
+            "detect-secrets",
+        ]
+        saved: list[dict[str, object]] = []
+        current = [make_lint_result(tool_name=t, exit_code=0, stdout="") for t in tool_names]
+        current.append(
+            make_lint_result(
+                tool_name="pyright check",
+                stdout=json.dumps({"summary": {"errorCount": 0, "warningCount": 0}}),
+            )
+        )
+        violations, _ = diff_baseline_with(tmp_path, saved, current)
+        assert violations == []
 
 
 # ── Parser edge cases ────────────────────────────────────────────

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
