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
  "slug": "checkers-factories-split",
  "kind": "test-only",
  "title": "Split checkers factories by domain",
  "assignment": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (from tests.checkers._factories import|from ._factories import; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test naming + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
  "outlineRef": "checkers-factories-split",
  "milestone": "M2",
  "wave": 2,
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
diff --git a/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..f56f707
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,197 @@
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
+        durationMs: 384
+        details: 189 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 68976
+        details: |-
+          ============================================================
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
+          Success: No issues found in 29 files (19ms)
+
+          ============================================================
+          [mypy] PASSED [6.3s]
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
+          [mypy.stubtest] PASSED [10.1s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.1s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794190824813",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.598
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
+          [pylint] PASSED [11.9s]
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
+          [pylint-pyi] PASSED [10.5s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [16.6s]
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
+                  "modulesLinted": 83,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] PASSED [6.0s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 30147
+        details: |-
+          [Tach] 1364 tests in 59 files unaffected by changes (~35.6s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          .......................ssss............................................. [ 16%]
+          ........................................................................ [ 21%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 32%]
+          ........................................................................ [ 37%]
+          ........................................................................ [ 42%]
+          ........................................................................ [ 48%]
+          ........................................................................ [ 53%]
+          ........................................................................ [ 58%]
+          ........................................................................ [ 64%]
+          ........................................................................ [ 69%]
+          ........................................................................ [ 74%]
+          ........................................................................ [ 80%]
+          ........................................................................ [ 85%]
+          ........................................................................ [ 90%]
+          ........................................................................ [ 96%]
+          ..................................................                       [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1342 passed, 4 skipped, 18 deselected, 4 warnings in 28.17s
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
+        durationMs: 66124
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 51s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 65.13s (0:01:05)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (17 test files changed)
diff --git a/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..b2082a0
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/input.md
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
+  "slug": "checkers-factories-split",
+  "kind": "test-only",
+  "title": "Split checkers factories by domain",
+  "assignment": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (from tests.checkers._factories import|from ._factories import; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test naming + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
+  "outlineRef": "checkers-factories-split",
+  "milestone": "M2",
+  "wave": 2,
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
diff --git a/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..90ecd9f
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T01:59:07.330Z
+session: 01a1be07-de92-76b0-a077-d5797a333431
+endedAt: 2026-11-09T02:22:47.356Z
+usage:
+  inputTokens: 139944
+  outputTokens: 56009
+  costUsd: 0.072803
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-09-202Z_01a1be07-de92-76b0-a077-d5797a333431
diff --git a/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..481c707
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,78 @@
+status: ok
+summary: "Split the 1393-line tests/checkers/_factories.py by checker domain
+  into 9 modules: 8 domain modules (_factories_beartype 43,
+  _factories_no_try_import 95, _factories_stub 474, _factories_stub_callable
+  163, _factories_stub_class 165, _factories_stub_coverage 257,
+  _factories_stub_docstring 178, _factories_stub_normalizer 63) plus a 75-line
+  shared _factories.py holding only _run_pylint. All 49 parametrize tables are
+  now typed list[ParameterSet] (TYPE_CHECKING import) instead of list[Any] with
+  comments; all 8 importer modules migrated; deleted the unused import_usage
+  passthrough and the trivial make_tc wrapper (inlined to _make_tc_factory),
+  with survivor notes in the shared module docstring. No too-many-lines disables
+  remain anywhere under tests/checkers, every split module is <=474 lines, test
+  node IDs are hash-identical to HEAD, and all
+  checkers/full-suite/integration/lint gates are green."
+target:
+  command: uv run pytest tests/checkers -q
+  customTarget: true
+evidence:
+  - "Recounted importers at HEAD: exactly 8 test modules imported
+    tests.checkers._factories (beartype, no_try_import, stub, stub_callable,
+    stub_class, stub_coverage, stub_docstring, stub_normalizer); item report '8
+    families' confirmed, split resolves to 9 modules = 8 domains + shared
+    subprocess helper."
+  - "Module sizes: wc -l tests/checkers/_factories*.py => 43, 63, 75, 95, 163,
+    165, 178, 257, 474; all <= 500. grep -rn too-many-lines tests/checkers/ =>
+    zero matches."
+  - "Typing: 49 case tables now annotated list[ParameterSet] (grep -c per
+    domain: 3/2/12/8/5/10/5/4); stale 'list[Any] is a test factory return type'
+    comments removed from tables."
+  - "Behavior preservation: executed HEAD _factories.py side-by-side with all 8
+    new modules and asserted value equality for 49 tables (lambdas compared by
+    id/type); output: 'OK: 49 tables value-equal across 8 domain modules'."
+  - "Golden collection hash: HEAD snapshot (git archive HEAD in temp dir) vs
+    working tree, pytest --collect-only sorted node IDs excluding Tach banner =>
+    both sha256
+    572e41b98ca868cdf331f3a793d9ea36f0d788cafff2cea55470ea53938331de; 640
+    collected node IDs, identical."
+  - "tests/checkers baseline vs final: baseline run 637/642 collected, 633
+    passed, 4 skipped, 5 deselected; final run identical 633 passed, 4 skipped,
+    5 deselected (exit 0)."
+  - "Full suite: uv run pytest -q => 1342 passed, 4 skipped, 18 deselected, exit
+    0."
+  - "Integration golden: uv run pytest tests/integration.py -q => 9 passed, exit
+    0 (covers assert_matches_golden/assert_golden_byte_identical)."
+  - "Format: uv run ruff format --config config/ruff.toml --check on all 17
+    touched files => '17 files already formatted'; final lint pipeline [ruff
+    format] PASSED."
+  - "Full lint gate: uv run lint => 14/14 tools PASSED (tach, ruff format, ruff
+    check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright
+    verify types, pylint, pylint-pyi, pylint tests, detect-secrets),
+    LINT_EXIT:0."
+  - "Scope audit: git status shows only tests/checkers/_factories*.py + 8
+    importer test modules; zero changes under src/, lint.baseline, docs/,
+    tests/data/."
+  - Importer diffs are import-path/docstring only; no test functions renamed,
+    preserving collection IDs and markers; all 8 touched test modules retain
+    pytestmark = pytest.mark.no_external_api.
+concerns:
+  - _factories_stub.py is 474/500 lines, leaving only 26 lines of C0302 headroom
+    for future stub rows; further growth should extract the import-contract
+    tables into a sibling module.
+  - The two end-to-end subprocess tests in test_stub_checker_callable.py /
+    test_stub_checker_class.py inherit the module-level no_external_api marker
+    even though they spawn pylint; marker reclassification was left out of scope
+    to preserve existing test-selection semantics.
+  - Shared _run_pylint stays in the canonical _factories.py (rather than a 9th
+    domain file) because both callable and class suites use it; this is the
+    9-vs-8 discrepancy the reviewer flagged.
+notes: "Domain mapping: beartype-> _factories_beartype; no_try_import->
+  _factories_no_try_import; stub core rows/walkers/import-contract builders->
+  _factories_stub; callable extraction+comparison+integration rows->
+  _factories_stub_callable; class fidelity rows+walk_stub_checker_with_pair->
+  _factories_stub_class; coverage rows+make_coverage_checker+layout builders->
+  _factories_stub_coverage; docstring rows+walk_both_release_for_pyi->
+  _factories_stub_docstring; normalizer rows-> _factories_stub_normalizer.
+  Deleted helpers: import_usage (no callers; construct ImportUsage directly) and
+  make_tc (trivial wrapper; inlined as
+  _make_tc_factory(_stub_checker_class()))."
diff --git a/tests/checkers/_factories.py b/tests/checkers/_factories.py
index ab45b20..e64883c 100644
--- a/tests/checkers/_factories.py
+++ b/tests/checkers/_factories.py
@@ -1,1211 +1,28 @@
-"""Shared non-fixture factory functions and parametrise tables for the
-python-setup checker test suite.
-
-Distinct from ``tests/conftest.py``: pytest auto-discovers and auto-injects
-``conftest.py`` fixtures, but module-level callables / data tables used by
-``@pytest.mark.parametrize`` rows at collection time must be importable.
-This module is the single import target — every checker test file does
-``from tests.checkers._factories import ...`` so collection never depends on
-which pytest ``rootdir`` setting is active.
-
-Tables here are pure data (no side effects, no `tmp_path`); row data is
-free LOC and does NOT count against the per-file LOC gate. Helpers that
-build astroid modules from source / assert message ids live here too.
+"""Shared test-factory helpers for the python-setup checker test suite.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Domain modules:
+
+- ``_factories_no_try_import`` — ``NoTryImportChecker`` rows
+- ``_factories_beartype`` — ``BeartypeCoverageChecker`` rows
+- ``_factories_stub`` — ``StubChecker`` core rows, walkers, state builders
+- ``_factories_stub_callable`` — callable-fidelity rows
+- ``_factories_stub_class`` — class-fidelity rows and walker
+- ``_factories_stub_coverage`` — coverage rows and layout builders
+- ``_factories_stub_docstring`` — ``StubDocstringChecker`` rows and walker
+- ``_factories_stub_normalizer`` — ``AnnotationNormalizer`` rows
+
+Only helpers shared by more than one domain live here. The former ``make_tc``
+and ``import_usage`` passthroughs were deleted as unused wrappers; survivors
+call ``_make_tc_factory`` or construct ``ImportUsage`` directly.
 """
-# pylint: disable=too-many-lines  # data tables are free LOC per file docstring; parametrize rows don't count against per-file LOC gate
 
 from __future__ import annotations
 
-import inspect
-from pathlib import Path
-from typing import TYPE_CHECKING, Any
-from unittest.mock import MagicMock
-
-import astroid
-import pytest
-from pylint.testutils import CheckerTestCase
-
-from python_setup_lint.testing import _make_tc as _make_tc_factory
+from typing import TYPE_CHECKING
 
 if TYPE_CHECKING:
-    from pylint.checkers import BaseChecker
-
-    from python_setup_lint.checkers.stub.checker import StubChecker
-    from python_setup_lint.checkers.stub.import_contract import ImportUsage
-
-_p = pytest.param
-
-
-# ── Generic message helpers ──
-
-
-def make_tc(checker_class: type[BaseChecker]) -> CheckerTestCase:  # pylint: disable=W9728  # test helper: type-specific alias for _make_tc_factory, avoids repeated imports
-    return _make_tc_factory(checker_class)
-
-
-# ── no-try-import checker ──
-
-_NO_TRY_DETECT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "try:\n    import litellm\nexcept ImportError:\n    pass\n",
-        1,
-        ("ImportError",),
-        id="import_in_try_except_importerror",
-    ),
-    _p(
-        "try:\n    import litellm\nexcept ModuleNotFoundError:\n    pass\n",
-        1,
-        (),
-        id="import_in_try_except_modulenotfound",
-    ),
-    _p(
-        "try:\n    from pydantic import ValidationError\nexcept ImportError:\n    pass\n",
-        1,
-        (),
-        id="from_import_in_try_except_importerror",
-    ),
-    _p(
-        "try:\n    import httpx\nexcept:\n    pass\n",
-        1,
-        ("bare except",),
-        id="import_in_try_bare_except",
-    ),
-    _p(
-        "try:\n    import litellm\nexcept (ImportError, ModuleNotFoundError):\n    pass\n",
-        1,
-        (),
-        id="import_in_try_tuple_import_errors",
-    ),
-    _p(
-        "try:\n    import litellm\nexcept ImportError:\n    pass\n\ntry:\n    import httpx\nexcept ImportError:\n    pass\n",
-        2,
-        (),
-        id="two_imports_separate_try_blocks",
-    ),
-    _p(
-        "try:\n    import litellm\nexcept ImportError:\n    pass\nexcept ModuleNotFoundError:\n    pass\n",
-        2,
-        (),
-        id="two_imports_separate_handlers_one_try",
-    ),
-    _p(
-        "try:\n    import litellm\nexcept ValueError:\n    pass\n",
-        0,
-        (),
-        id="import_in_try_non_import_handler_not_flagged",
-    ),
-    _p(
-        "try:\n    import httpx\nexcept ValueError:\n    pass\nexcept ImportError:\n    pass\nexcept OSError:\n    pass\n",
-        1,
-        (),
-        id="handler_mixed_import_and_non_import",
-    ),
-    _p(
-        "try:\n    import litellm as _litellm\nexcept ImportError:\n    _litellm = None\n",
-        1,
-        (),
-        id="proxy_module_level_guard",
-    ),
-]
-
-_NO_TRY_DO_NOT_DETECT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "try:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    pass\n",
-        id="try_without_import",
-    ),
-    _p("import os\nx = os.path.join('a', 'b')\n", id="import_outside_try"),
-    _p("", id="empty_module"),
-    _p(
-        "try:\n    result = api_call()\nexcept ConnectionError:\n    result = None\n",
-        id="non_import_exception_handling",
-    ),
-]
-
-
-# ── beartype checker ──
-
-_BEARTYPE_MISS_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def foo(): pass", 1, None, id="plain_def"),
-    _p("async def foo(): pass", 1, None, id="async_def"),
-    _p("class X:\n    def method(self): pass", 1, "method", id="public_method_in_class"),
-    _p("def foo(): pass\ndef bar(): pass\n", 2, None, id="multiple_public_functions"),
-]
-
-_BEARTYPE_SOURCE_ROOT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def foo(): pass", "tests/test_mod.py", 0, id="outside_source_root"),
-    _p("def foo(): pass", "src/prod.py", 1, id="under_source_root"),
-]
-
-_BEARTYPE_SKIP_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def _helper(): pass", 0, id="private_function"),
-    _p("def public(): pass\ndef _private(): pass\n", 1, id="mixed_public_and_private"),
-    _p("class X:\n    def __init__(self): pass", 0, id="init_skipped"),
-    _p("class X:\n    def __str__(self): pass", 0, id="str_skipped"),
-    _p(
-        "class X:\n    def __init__(self): pass\n    def run(self): pass",
-        1,
-        id="dunder_only_init_skipped_then_public",
-    ),
-]
-
-
-# ── stub normalizer ──
-
-_NORMALIZER_INFER_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("x: str", "str", id="infer_simple_name"),
-    _p("x: list[int]", "list[int]", id="infer_builtin_list"),
-    _p("x: str | None", "str | None", id="infer_native_union"),
-    _p("x: 'SomeFutureType'", None, id="infer_uninferable_returns_non_null"),
-]
-
-
-# ── stub checker ──
-
-_STUB_FILE_CLASSIFICATION_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "/workspace/tests/test_foo.py",
-        ["/workspace/src"],
-        None,
-        None,
-        0,
-        id="test_file_in_tests_dir",
-    ),
-    _p(
-        "/workspace/src/test_example.py",
-        ["/workspace/src"],
-        ["test_*.py", "tests/"],
-        None,
-        0,
-        id="test_file_named_test_prefixed",
-    ),
-    _p(
-        "/workspace/other/foo.py",
-        ["/workspace/src"],
-        None,
-        None,
-        0,
-        id="file_outside_source_root_skipped",
-    ),
-    _p(
-        "/workspace/src/generated/foo.py",
-        ["/workspace/src"],
-        None,
-        ["src/generated/"],
-        0,
-        id="opted_out_by_directory",
-    ),
-    _p(
-        "/workspace/src/vendor/external.py",
-        ["/workspace/src"],
-        None,
-        ["src/vendor/"],
-        0,
-        id="opted_out_by_filename",
-    ),
-]
-
-_RESOLVE_RELATIVE_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("mod_a", 0, "os", False, "os", id="absolute_import"),
-    _p("mod_a", 0, None, False, "", id="absolute_no_modname"),
-    _p("mypkg", 1, None, True, "mypkg", id="same_package_init"),
-    _p("mypkg", 1, "mod_a", True, "mypkg.mod_a", id="same_package_init_with_name"),
-    _p("mypkg.mod_a", 2, "sibling", False, "sibling", id="parent_package"),
-    _p("pkg.sub.mod_a", 3, "other", False, "other", id="grandparent_package"),
-    _p("mod_a", 3, "other", True, "other", id="level_exceeds_depth"),
-]
-
-_IS_TYPE_CHECKING_GUARD_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("TYPE_CHECKING", True, id="name_form"),
-    _p("typing.TYPE_CHECKING", True, id="typing_dot_name"),
-    _p("SOME_FLAG", False, id="other_name"),
-    _p("os.name", False, id="other_attribute"),
-]
-
-_IN_TYPE_CHECKING_BLOCK_POSITIVE_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "if TYPE_CHECKING:\n    from foo import Bar\n",
-        lambda m: m.body[0].body[0],
-        id="under_type_checking",
-    ),
-    _p(
-        "if TYPE_CHECKING:\n    if True:\n        from foo import Bar\n",
-        lambda m: m.body[0].body[0].body[0],
-        id="nested_inside_type_checking",
-    ),
-]
-
-_IN_TYPE_CHECKING_BLOCK_NEGATIVE_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("from foo import Bar\n", lambda m: m.body[0], id="not_under_type_checking"),
-]
-
-
-# ── stub coverage helper tests ──
-
-_MATCHES_PATH_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("/workspace/src/foo.py", [], False, id="empty_patterns_returns_false"),
-    _p("src/generated/foo.py", ["src/generated/"], True, id="directory_prefix_match"),
-    _p(
-        "/workspace/src/generated/foo.py",
-        ["src/generated/"],
-        True,
-        id="directory_prefix_with_leading_slash",
-    ),
-    _p(
-        "/workspace/src/handwritten/foo.py",
-        ["src/generated/"],
-        False,
-        id="directory_prefix_no_match",
-    ),
-    _p("/workspace/src/test_example.py", ["test_*.py"], True, id="fnmatch_full_path"),
-    _p("/workspace/src/foo/bar_test.py", ["*_test.py"], True, id="fnmatch_basename"),
-    _p("/workspace/src/prod.py", ["test_*.py"], False, id="fnmatch_no_match"),
-    _p("src\\generated\\foo.py", ["src\\generated\\"], True, id="backslash_pattern"),
-    _p(
-        "/workspace/tests/test_foo.py",
-        ["tests/", "test_*.py", "*_test.py"],
-        True,
-        id="multiple_patterns_any_match",
-    ),
-    _p(
-        "/workspace/src/prod.py",
-        ["tests/", "test_*.py"],
-        False,
-        id="multiple_patterns_none_match",
-    ),
-]
-
-_DEFAULT_TEST_PATTERNS = ["tests/", "test_*.py", "*_test.py", "conftest.py"]
-
-_IS_TEST_FILE_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "/workspace/tests/test_foo.py",
-        _DEFAULT_TEST_PATTERNS,
-        True,
-        id="tests_dir_match",
-    ),
-    _p(
-        "/workspace/src/test_example.py",
-        _DEFAULT_TEST_PATTERNS,
-        True,
-        id="test_prefixed_filename",
-    ),
-    _p(
-        "/workspace/src/foo_test.py",
-        _DEFAULT_TEST_PATTERNS,
-        True,
-        id="suffixed_filename",
-    ),
-    _p("/workspace/src/conftest.py", _DEFAULT_TEST_PATTERNS, True, id="conftest"),
-    _p(
-        "/workspace/src/prod.py",
-        _DEFAULT_TEST_PATTERNS,
-        False,
-        id="production_file_not_test",
-    ),
-]
-
-_IS_TEST_FILE_CUSTOM_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("/workspace/specs/test_foo.py", ["specs/"], True, id="custom_pattern_matches"),
-    _p(
-        "/workspace/tests/test_foo.py",
-        ["specs/"],
-        False,
-        id="custom_pattern_excludes_tests",
-    ),
-]
-
-_IS_OPTED_OUT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "/workspace/src/generated/foo.py",
-        ["src/generated/"],
-        True,
-        id="opted_out_by_directory",
-    ),
-    _p(
-        "/workspace/src/handwritten/foo.py",
-        ["src/generated/"],
-        False,
-        id="not_opted_out",
-    ),
-    _p(
-        "/workspace/src/vendor_foo.py",
-        ["vendor_*.py"],
-        True,
-        id="opted_out_by_filename",
-    ),
-    _p("/workspace/src/foo.py", [], False, id="empty_opt_out"),
-]
-
-_IS_INIT_EXEMPT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("", True, id="empty_body_exempt"),
-    _p("from .sub import Foo\nimport os\n", True, id="only_imports_exempt"),
-    _p("__all__ = ['Foo', 'Bar']\n", True, id="all_assignment_exempt"),
-    _p("def __getattr__(name): ...\n", False, id="getattr_defined_not_exempt"),
-    _p("def helper(): pass\n", False, id="function_def_not_exempt"),
-    _p("class Helper: pass\n", False, id="class_def_not_exempt"),
-    _p("setup(name='foo')\n", False, id="standalone_expression_not_exempt"),
-    _p("x = 1\n", False, id="non_all_assignment_not_exempt"),
-    _p("x: int = 1\n", False, id="ann_assign_not_exempt"),
-    _p("__version__: str = _version('x')\n", True, id="version_ann_assign_exempt"),
-    _p("__all__: list[str] = []\n", True, id="all_ann_assign_exempt"),
-    _p("__version__: str = _version('x')\n__all__: list[str] = []\n", True, id="init_metadata_exempt"),
-    _p("import os\nif os.name == 'nt':\n    x = 1\n", False, id="if_block_not_exempt"),
-]
-
-_IS_TRIVIAL_TEST_DATA_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("", True, id="empty_module_trivial"),
-    _p("x = 1\ny = 'hello'\nz = 3.14\n", True, id="literal_assignments_trivial"),
-    _p("def helper(): pass\n", False, id="function_def_not_trivial"),
-    _p("class Data: pass\n", False, id="class_def_not_trivial"),
-    _p("import os\n", False, id="import_not_trivial"),
-    _p("1 + 1\n", False, id="expression_not_trivial"),
-    _p("x = 1\nif True:\n    y = 2\n", False, id="if_block_not_trivial"),
-]
-
-_HAS_MAIN_BLOCK_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("if __name__ == '__main__':\n    main()\n", True, id="double_equals"),
-    _p('if __name__ == "__main__":\n    main()\n', True, id="double_quotes"),
-    _p("def foo(): pass\n", False, id="no_main_block"),
-    _p("if __name__ != '__main__':\n    pass\n", False, id="different_condition"),
-    _p("", False, id="empty_module"),
-]
-
-_IS_UNDER_SOURCE_ROOT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("/workspace/src/prod.py", ["/workspace/src"], True, id="path_under_root"),
-    _p("/workspace/tests/foo.py", ["/workspace/src"], False, id="path_not_under_root"),
-    _p(
-        "/workspace/lib/foo.py",
-        ["/workspace/src", "/workspace/lib"],
-        True,
-        id="multiple_roots",
-    ),
-]
-
-
-# ── stub_callable: extract param descriptors ──
-
-_EXTRACT_PARAM_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def foo() -> None: ...", [], [], id="empty_function"),
-    _p(
-        "def foo(a, b, /) -> None: ...",
-        ["a", "b"],
-        [inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_ONLY],
-        id="positional_only",
-    ),
-    _p(
-        "def foo(a, b) -> None: ...",
-        ["a", "b"],
-        [
-            inspect.Parameter.POSITIONAL_OR_KEYWORD,
-            inspect.Parameter.POSITIONAL_OR_KEYWORD,
-        ],
-        id="positional_or_keyword",
-    ),
-    _p(
-        "def foo(*args) -> None: ...",
-        ["args"],
-        [inspect.Parameter.VAR_POSITIONAL],
-        id="var_positional",
-    ),
-    _p(
-        "def foo(*, x, y) -> None: ...",
-        ["x", "y"],
-        [inspect.Parameter.KEYWORD_ONLY, inspect.Parameter.KEYWORD_ONLY],
-        id="keyword_only",
-    ),
-    _p(
-        "def foo(**kwargs) -> None: ...",
-        ["kwargs"],
-        [inspect.Parameter.VAR_KEYWORD],
-        id="var_keyword",
-    ),
-]
-
-_EXTRACT_DEFAULT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def foo(a, b=1) -> None: ...", [False, True], id="default_presence_detected"),
-    _p(
-        "def foo(*, x, y='hello') -> None: ...",
-        [False, True],
-        id="default_presence_kwonly",
-    ),
-]
-
-_EXTRACT_STRIP_SELF_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def bar(self, x, y) -> None: ...", True, ["x", "y"], id="strip_self"),
-    _p("def bar(cls, x, y) -> None: ...", True, ["x", "y"], id="strip_cls"),
-    _p("def bar(a, b) -> None: ...", True, ["a", "b"], id="no_strip_non_method"),
-]
-
-_EXTRACT_ANNOTATION_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "def foo(x: int, y: str | None) -> None: ...",
-        "int",
-        None,
-        id="annotations_extracted",
-    ),
-    _p("def foo(*args: int) -> None: ...", "int", None, id="vararg_annotation"),
-    _p("def foo(**kwargs: str) -> None: ...", "str", None, id="kwarg_annotation"),
-]
-
-
-# ── stub_callable: compare descriptors ──
-
-_COMPARE_DESCRIPTOR_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        [
-            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-        ],
-        [
-            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-        ],
-        None,
-        id="identical_params",
-    ),
-    _p(
-        [
-            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
-        ],
-        [("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
-        "param_count",
-        id="param_count_mismatch",
-    ),
-    _p(
-        [("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
-        [("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
-        "param_name",
-        id="param_name_mismatch",
-    ),
-    _p(
-        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
-        [("x", inspect.Parameter.KEYWORD_ONLY, False)],
-        "param_kind",
-        id="param_kind_mismatch",
-    ),
-    _p(
-        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, True)],
-        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
-        "param_default",
-        id="default_presence_mismatch",
-    ),
-    _p([], [], None, id="empty_lists"),
-]
-
-_COMPARE_ANNOTATION_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(["int", "str"], ["int", "str"], 0, None, id="all_match_returns_empty"),
-    _p(["int", "str"], ["int", "int"], 1, "y", id="param_annotation_mismatch_detected"),
-    _p([None], ["int"], 0, None, id="skips_missing_annotations"),
-    _p([None], [None], 0, None, id="skips_no_annotation_on_both"),
-]
-
-_COMPARE_RETURN_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(None, None, "skip_both_none", True, id="both_none"),
-    _p(None, "int", "skip_both_none", True, id="stub_none_skipped"),
-    _p("int", None, "skip_both_none", True, id="impl_none_skipped"),
-    _p("int", "int", "compare", True, id="matching_returns"),
-    _p("str", "int", "compare", False, id="mismatched_returns"),
-    _p("typing.List[int]", "list[int]", "compare", True, id="normalized_typing"),
-]
-
-
-# ── stub_class fidelity: _normalize_bases ──
-
-_NORMALIZE_BASES_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("class Foo(BaseModel): ...\n", ["BaseModel"], id="simple_name"),
-    _p("class Foo(pydantic.BaseModel): ...\n", ["BaseModel"], id="attribute_base"),
-    _p("class Foo(object): ...\n", ["builtins.object"], id="builtins_object"),
-    _p("class Foo(B, A, C): ...\n", ["A", "B", "C"], id="multiple_bases_sorted"),
-    _p("class Foo(Generic[T]): ...\n", ["Generic"], id="subscript_base"),
-]
-
-_IS_PUBLIC_METHOD_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("foo", True, id="plain_name"),
-    _p("_helper", False, id="private_name"),
-    _p("__str__", False, id="dunder_str"),
-    _p("__init__", True, id="init"),
-    _p("__new__", True, id="new"),
-    _p("__repr__", False, id="repr"),
-]
-
-
-# ── stub_class: E97B1 / E97B2 ──
-
-_STUB_SYMBOL_MISSING_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "x: int = 1\n",
-        "x: int\nclass Foo: ...\n",
-        "stub-symbol-missing",
-        1,
-        "Foo",
-        id="stub_class_missing_from_impl",
-    ),
-    _p(
-        "x: int = 1\n",
-        "x: int\ndef foo(): ...\n",
-        "stub-symbol-missing",
-        1,
-        "foo",
-        id="stub_func_missing_from_impl",
-    ),
-    _p(
-        "x: int = 1\n",
-        "x: int\ny: str\n",
-        "stub-symbol-missing",
-        1,
-        "y",
-        id="stub_var_missing_from_impl",
-    ),
-]
-
-_KIND_MISMATCH_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "Foo: int = 1\n",
-        "class Foo: ...\n",
-        "symbol-kind-mismatch",
-        id="stub_class_impl_var",
-    ),
-    _p(
-        "foo: int = 1\n",
-        "def foo(): ...\n",
-        "symbol-kind-mismatch",
-        id="stub_func_impl_var",
-    ),
-    _p(
-        "def Foo(): ...\n",
-        "class Foo: ...\n",
-        "symbol-kind-mismatch",
-        id="stub_class_impl_func",
-    ),
-    _p(
-        "class Foo: ...\n",
-        "Foo: int\n",
-        "symbol-kind-mismatch",
-        id="stub_var_impl_class",
-    ),
-]
-
-
-# ── stub docstring checker ──
-
-_DOCSTRING_NO_COMPANION_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        'def foo():\n    """My docstring."""\n    pass\n',
-        0,
-        id="no_companion_plain_func",
-    ),
-    _p(
-        'async def foo():\n    """My docstring."""\n    pass\n',
-        0,
-        id="no_companion_async_func",
-    ),
-    _p(
-        'class MyClass:\n    def method(self):\n        """Method doc."""\n        pass\n',
-        0,
-        id="no_companion_method",
-    ),
-]
-
-_DOCSTRING_DOES_NOT_DETECT_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("def foo():\n    pass\n", id="no_docstring_no_message"),
-    _p("def foo():\n    ...\n", id="empty_body_no_message"),
-    _p(
-        'class MyClass:\n    """Class-level docs."""\n    pass\n',
-        id="class_docstring_no_message",
-    ),
-    _p("def foo():\n    42\n    pass\n", id="non_string_first_expr"),
-]
-
-_DOCSTRING_DETECT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        'def foo():\n    """Usage docstring."""\n    pass\n',
-        1,
-        "foo",
-        id="function_docstring_detected",
-    ),
-    _p(
-        'async def foo():\n    """Usage docstring."""\n    pass\n',
-        1,
-        None,
-        id="async_function_docstring_detected",
-    ),
-    _p(
-        'class MyClass:\n    def method(self):\n        """Method doc."""\n        pass\n',
-        1,
-        "method",
-        id="method_docstring_detected",
-    ),
-    _p(
-        'def foo():\n    """Doc."""\n    pass\n\ndef bar():\n    pass\n',
-        1,
-        None,
-        id="mixed_docstrings_and_no_docstrings",
-    ),
-]
-
-_DOCSTRING_RETURNS_DETECT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        'def f() -> int:\n    """Do something."""\n    return 1\n',
-        1,
-        id="generic_int_fires",
-    ),
-    _p(
-        'def f() -> str:\n    """Do something."""\n    return "x"\n',
-        1,
-        id="generic_str_fires",
-    ),
-    _p(
-        'def f() -> bool:\n    """Do something."""\n    return True\n',
-        1,
-        id="generic_bool_fires",
-    ),
-    _p(
-        'def f() -> dict[str, int]:\n    """Do something."""\n    return {}\n',
-        1,
-        id="generic_dict_str_fires",
-    ),
-    _p(
-        'def f() -> dict[int, str]:\n    """Do something."""\n    return {}\n',
-        1,
-        id="generic_dict_int_fires",
-    ),
-]
-
-_DOCSTRING_RETURNS_DO_NOT_DETECT_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        'def f() -> UserId:\n    """Do something."""\n    return UserId(1)\n',
-        id="named_alias_skips",
-    ),
-    _p(
-        'def _helper() -> int:\n    """Do something."""\n    return 1\n',
-        id="underscore_prefixed_skips",
-    ),
-    _p(
-        'def f() -> None:\n    """Do something."""\n    pass\n',
-        id="none_return_skips",
-    ),
-    _p(
-        "def f() -> int:\n    pass\n",
-        id="no_docstring_skips",
-    ),
-    _p(
-        'def f() -> int:\n    """Do something.\n\n    Returns:\n        The answer.\n    """\n    return 42\n',
-        id="has_returns_clause_skips",
-    ),
-    _p(
-        'def f() -> int:\n    """Do something.\n\n    Yields:\n        Items.\n    """\n    yield 1\n',
-        id="has_yields_clause_skips",
-    ),
-    _p(
-        'def f() -> Self:\n    """Do something."""\n    return self\n',
-        id="self_return_skips",
-    ),
-    _p(
-        'def f() -> NoReturn:\n    """Do something."""\n    sys.exit(1)\n',
-        id="noreturn_skips",
-    ),
-    _p(
-        'def f() -> MyClass:\n    """Do something."""\n    return MyClass()\n',
-        id="custom_class_skips",
-    ),
-]
-
-
-# ── AnnotationNormalizer._apply_rewrites ──
-
-_APPLY_REWRITES_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("typing.List[str]", "list[str]", id="rewrite_typing_list"),
-    _p("typing.Dict[str, int]", "dict[str, int]", id="rewrite_typing_dict"),
-    _p("typing.Optional[str]", "str | None", id="rewrite_typing_optional"),
-    _p("typing.Union[str, int]", "str | int", id="rewrite_typing_union"),
-    _p(
-        "typing.Union[list[str], int]",
-        "list[str] | int",
-        id="rewrite_typing_union_nested_generic",
-    ),
-    _p(
-        "collections.abc.Callable",
-        "collections.abc.Callable",
-        id="rewrite_no_match_passes_through",
-    ),
-]
-
-_SPLIT_OUTER_COMMAS_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("str, int, float", ["str", "int", "float"], id="simple"),
-    _p("list[str], int", ["list[str]", "int"], id="with_brackets"),
-]
-
-
-# ── AnnotationNormalizer._ast_string ──
-
-_AST_STRING_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("x: list[str]", ["list"], "contains", id="subscript"),
-    _p("x: int | str", ["int | str"], "equals", id="binary_op_union"),
-    _p("x: typing.Optional[str]", ["typing.Optional"], "contains", id="attribute"),
-    _p("x: tuple[int, str]", None, "not_none", id="tuple"),
-    _p("x: Literal['hello']", ["hello"], "contains", id="const"),
-    _p("x: dict[str, list[int]]", ["dict", "list"], "contains", id="nested_subscript"),
-]
-
-
-# ── stub_coverage: shared checker construction ──
-
-
-def make_coverage_checker(**config_kwargs: Any) -> tuple[StubChecker, CheckerTestCase]:
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    tc = CheckerTestCase()
-    tc.CHECKER_CLASS = StubChecker
-    tc.setup_method()
-    for key, value in config_kwargs.items():
-        setattr(tc.linter.config, key, value)
-    tc.checker.open()
-    return tc.checker, tc
-
-
-# ── stub_import_contract helpers ──
-
-
-def build_import_contract_state(
-    *,
-    module_index: dict[str, tuple[Path, Any]] | None = None,
-    stub_index: dict[str, Path] | None = None,
-    declaration_index: dict[str, set[str]] | None = None,
-    import_usages: list[ImportUsage] | None = None,
-) -> tuple[StubChecker, CheckerTestCase]:
-
-    tc = make_tc(_stub_checker_class())
-    c = tc.checker._coverage
-    if module_index is not None:
-        c.module_index = module_index
-    if stub_index is not None:
-        c.stub_index = stub_index
-    if declaration_index is not None:
-        c.declaration_index = declaration_index
-    if import_usages is not None:
-        c.import_usages = import_usages
-        for usage in import_usages:
-            if usage.importer_module not in c.module_index:
-                mock_node = MagicMock()
-                mock_node.name = usage.importer_module
-                mock_node.position = None
-                c.module_index[usage.importer_module] = (
-                    Path(f"/workspace/src/{usage.importer_module}.py"),
-                    mock_node,
-                )
-    return tc.checker, tc
-
-
-def _stub_checker_class() -> type[StubChecker]:
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    return StubChecker
-
-
-def import_usage(*args: Any, **kwargs: Any) -> ImportUsage:
-    from python_setup_lint.checkers.stub.import_contract import ImportUsage
-
-    return ImportUsage(*args, **kwargs)
-
-
-# ── stub_docstring: shared walker ──
-
-
-def walk_both_release_for_pyi(
-    code: str,
-    py_path: Path,
-    source_roots: list[str] | None = None,
-) -> list[Any]:  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    from pylint.testutils import UnittestLinter
-    from pylint.utils import ASTWalker
-
-    from python_setup_lint.checkers.stub.checker import StubChecker
-    from python_setup_lint.checkers.stub.docstring_checker import StubDocstringChecker
-
-    pyi_path = py_path.with_suffix(".pyi")
-    pyi_path.parent.mkdir(parents=True, exist_ok=True)
-    pyi_path.write_text("# stub\n")
-    module_name = py_path.stem
-    linter = UnittestLinter()
-    stub = StubChecker(linter)
-    stub_doc = StubDocstringChecker(linter)
-    linter.register_checker(stub_doc)
-    if source_roots:
-        linter.config.source_roots = source_roots
-    stub.open()
-    module = astroid.parse(code, module_name=module_name)
-    module.file = str(py_path)
-    walker = ASTWalker(linter)
-    walker.add_checker(stub)
-    walker.add_checker(stub_doc)
-    walker.walk(module)
-    return linter.release_messages()
-
-
-# ── stub_checker: import-usage / contract-violations tables ──
-
-_IMPORT_USAGE_FIELD_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        {
-            "importer_module": "mod_a",
-            "lineno": 5,
-            "target_module": "mod_b",
-            "symbol_name": "Foo",
-            "alias": None,
-            "is_star": False,
-        },
-        {
-            "importer_module": "mod_a",
-            "lineno": 5,
-            "target_module": "mod_b",
-            "symbol_name": "Foo",
-            "alias": None,
-            "is_star": False,
-        },
-        id="fields",
-    ),
-    _p(
-        {
-            "importer_module": "mod_a",
-            "lineno": 3,
-            "target_module": "mod_b",
-            "symbol_name": None,
-            "alias": None,
-            "is_star": False,
-        },
-        {"symbol_name": None},
-        id="module_import_symbol_name_none",
-    ),
-    _p(
-        {
-            "importer_module": "mod_a",
-            "lineno": 7,
-            "target_module": "mod_b",
-            "symbol_name": "*",
-            "alias": None,
-            "is_star": True,
-        },
-        {"is_star": True},
-        id="star_import_is_star",
-    ),
-]
-
-_IMPORT_CONTRACT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "mod_a",
-        False,
-        None,
-        "mod_a",
-        "Foo",
-        False,
-        None,
-        "missing-module-stub-for-import",
-        1,
-        id="e97a2_when_target_no_stub",
-    ),
-    _p(
-        "mod_b",
-        True,
-        {"Foo"},
-        "mod_a",
-        "Bar",
-        False,
-        None,
-        "missing-import-declaration",
-        1,
-        id="e97a1_when_symbol_not_declared",
-    ),
-    _p(
-        "mod_b",
-        True,
-        {"Foo"},
-        "mod_a",
-        "Foo",
-        False,
-        None,
-        None,
-        0,
-        id="no_violation_when_symbol_declared",
-    ),
-    _p(
-        "mod_b",
-        True,
-        None,
-        "mod_a",
-        "*",
-        True,
-        "error",
-        "star-import-unresolvable",
-        1,
-        id="e97a3_star_import",
-    ),
-]
-
-_STAR_POLICY_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("error", 1, id="star_policy_error"),
-    _p("ignore", 0, id="star_policy_ignore"),
-]
-
-_VARIABLE_FIDELITY_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("ClassVar[int]", True, id="classvar_skipped"),
-    _p("int", False, id="non_classvar"),
-]
-
-
-# ── stub_checker: shared walk helpers ──
-
-
-def walk_stub_close_release(
-    code: str,
-    file_path: str,
-    *,
-    source_roots: list[str] | None = None,
-    test_patterns: list[str] | None = None,
-    stub_opt_out: list[str] | None = None,
-    stub_roots: list[str] | None = None,
-    module_name: str = "test_module",
-) -> list[Any]:  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    tc = _make_tc_factory(StubChecker)
-    if source_roots is not None:
-        tc.linter.config.source_roots = source_roots
-    if test_patterns is not None:
-        tc.linter.config.test_patterns = test_patterns
-    if stub_opt_out is not None:
-        tc.linter.config.stub_opt_out = stub_opt_out
-    if stub_roots is not None:
-        tc.linter.config.stub_roots = stub_roots
-    module = astroid.parse(code, module_name=module_name)
-    module.file = file_path
-    tc.checker.open()
-    tc.walk(module)
-    tc.checker.close()
-    return tc.linter.release_messages()
-
-
-# ── T1-pyi-exemption layout rows ──
-
-_PYI_EXEMPT_LOG_LAYOUT_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "init",
-        "from .sub import Foo\n",
-        "Exempt __init__.py",
-        id="init_exempt_logs_record",
-    ),
-    _p(
-        "main",
-        "\ndef run():\n    pass\nif __name__ == '__main__':\n    run()\n",
-        "Exempt standalone script",
-        id="main_exempt_logs_record",
-    ),
-    _p(
-        "conftest",
-        "import pytest\n",
-        "Exempt conftest.py",
-        id="conftest_exempt_logs_record",
-    ),
-    _p(
-        "trivial_data",
-        "x = 1\ny = 'hello'\n",
-        "Exempt trivial test data module",
-        id="trivial_test_data_exempt_logs_record",
-    ),
-]
-
-
-def materialize_pyi_exempt_layout(
-    tmp_path: Path,
-    layout_kind: str,
-    code: str,
-    /,
-) -> tuple[str, list[str], str]:
-    src = tmp_path / "src"
-    if layout_kind == "init":
-        pkg = src / "mypkg"
-        pkg.mkdir(parents=True)
-        (pkg / "__init__.py").write_text(code)
-        return str(pkg / "__init__.py"), [str(src)], "mypkg"
-    if layout_kind == "main":
-        src.mkdir()
-        (src / "script.py").write_text(code)
-        return str(src / "script.py"), [str(src)], "script"
-    if layout_kind == "conftest":
-        src.mkdir()
-        (src / "conftest.py").write_text(code)
-        return str(src / "conftest.py"), [str(src)], "conftest_root"
-    if layout_kind == "trivial_data":
-        data_dir = tmp_path / "tests" / "data"
-        data_dir.mkdir(parents=True)
-        data_file = data_dir / "fixture_data.py"
-        data_file.write_text(code)
-        return str(data_file), [str(tmp_path / "src")], "tests.data.fixture_data"
-    raise ValueError(f"unknown layout_kind {layout_kind!r}")
-
-
-# ── stub_checker: import-contract / star-policy state builders ──
-
-
-def _build_star_import_policy_state(star_policy: str, import_usage_factory: Any, /) -> tuple[CheckerTestCase, StubChecker]:
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    mock_b = MagicMock()
-    mock_b.name = "mod_b"
-    mock_b.position = None
-    mock_a = MagicMock()
-    mock_a.name = "mod_a"
-    mock_a.position = None
-    tc = _make_tc_factory(StubChecker)
-    tc.checker._coverage.module_index = {
-        "mod_a": (Path("/workspace/src/mod_a.py"), mock_a),
-        "mod_b": (Path("/workspace/src/mod_b.py"), mock_b),
-    }
-    tc.checker._coverage.stub_index = {"mod_b": Path("/workspace/src/mod_b.pyi")}
-    tc.checker._coverage.star_import_policy = star_policy
-    tc.checker._coverage.import_usages = [import_usage_factory()]
-    return tc, tc.checker
-
-
-def _star_usage_factory() -> ImportUsage:
-    from python_setup_lint.checkers.stub.import_contract import ImportUsage
-
-    return ImportUsage("mod_a", 1, "mod_b", "*", None, True)
-
-
-# ── stub_checker: .pyi companion-resolution ──
-
-_STUB_RESOLUTION_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("inline", "x = 1\n", "has_stub", 0, id="inline_stub_detected"),
-    _p("package", "x = 1\n", "mypkg", 0, id="package_init_stub_detected"),
-    _p("stub_root", "x = 1\n", "foo", 0, id="stub_root_resolution"),
-    _p("no_stub", "y = 2\n", "unstubbed", 1, id="missing_stub_emits_e97a0"),
-    _p("empty", "", "", 0, id="no_stub_no_error_on_empty"),
-]
-
-
-def walk_stub_resolution_layout(
-    tmp_path: Path,
-    layout_kind: str,
-    code: str,
-    module_name: str,
-    /,
-) -> list[Any]:  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    tc = _make_tc_factory(StubChecker)
-    if layout_kind == "empty":
-        tc.checker.open()
-        tc.checker.close()
-        return tc.linter.release_messages()
-    src = tmp_path / "src"
-    src.mkdir()
-    tc.linter.config.source_roots = [str(src)]
-    py_file = src / f"{module_name}.py"
-    pyi_file: Path | None = None
-    if layout_kind == "package":
-        pkg = src / module_name
-        pkg.mkdir(parents=True)
-        py_file = pkg / "__init__.py"
-        pyi_file = pkg / "__init__.pyi"
-    elif layout_kind == "stub_root":
-        stub_root = tmp_path / "stubs"
-        stub_root.mkdir()
-        pyi_file = stub_root / f"{module_name}.pyi"
-        tc.linter.config.stub_roots = [str(stub_root)]
-    elif layout_kind == "inline":
-        pyi_file = src / f"{module_name}.pyi"
-    py_file.write_text(code)
-    if pyi_file is not None:
-        pyi_file.write_text("x: int\n")
-    tc.checker.open()
-    module = astroid.parse(code, module_name=module_name)
-    module.file = str(py_file)
-    tc.walk(module)
-    tc.checker.close()
-    return tc.linter.release_messages()
-
-
-# ── stub_coverage: _resolve_stub layout ──
-
-_RESOLVE_STUB_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("inline", "returns_pyi", id="inline_stub"),
-    _p("package", "returns_pyi", id="package_init_stub"),
-    _p("no_stub", "returns_none", id="no_stub_returns_none"),
-    _p("stub_root", "returns_pyi", id="stub_root_resolution"),
-]
-
-
-def materialize_resolve_stub_layout(tmp_path: Path, layout_kind: str, /) -> tuple[StubChecker, Path, Path | None]:
-    if layout_kind == "inline":
-        py_path = tmp_path / "mod.py"
-        py_path.write_text("x = 1\n")
-        stub_path = tmp_path / "mod.pyi"
-        stub_path.write_text("x: int\n")
-        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
-        return checker, py_path, stub_path
-    if layout_kind == "package":
-        pkg = tmp_path / "mypkg"
-        pkg.mkdir()
-        py_path = pkg / "__init__.py"
-        py_path.write_text("x = 1\n")
-        stub_path = pkg / "__init__.pyi"
-        stub_path.write_text("x: int\n")
-        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
-        return checker, py_path, stub_path
-    if layout_kind == "no_stub":
-        py_path = tmp_path / "mod.py"
-        py_path.write_text("x = 1\n")
-        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
-        return checker, py_path, None
-    src = tmp_path / "src"
-    src.mkdir()
-    py_path = src / "mod.py"
-    py_path.write_text("x = 1\n")
-    stub_root = tmp_path / "stubs"
-    stub_root.mkdir()
-    stub_path = stub_root / "mod.pyi"
-    stub_path.write_text("x: int\n")
-    checker, _tc = make_coverage_checker(source_roots=[str(src)], stub_roots=[str(stub_root)])
-    return checker, py_path, stub_path
-
-
-# ── stub_coverage: emit_coverage_violations ──
-
-_EMIT_COVERAGE_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("in_index", "mod_a", 1, id="one_missing_module"),
-    _p("no_missing", "", 0, id="no_missing_emits_nothing"),
-    _p("skip_module_not_in_index", "ghost_module", 0, id="skip_module_not_in_index"),
-]
-
-
-def make_emit_coverage_state(tmp_path: Path, setup_kind: str, stub_missing_module: str, /) -> tuple[CheckerTestCase, MagicMock]:
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    tc = CheckerTestCase()
-    tc.CHECKER_CLASS = StubChecker
-    tc.setup_method()
-    mock_node = MagicMock()
-    mock_node.name = stub_missing_module or "anon"
-    if not stub_missing_module:
-        tc.checker._coverage.stub_missing = set()
-    elif setup_kind == "in_index":
-        tc.checker._coverage.module_index[stub_missing_module] = (
-            tmp_path / f"{stub_missing_module}.py",
-            mock_node,
-        )
-        tc.checker._coverage.stub_missing = {stub_missing_module}
-    else:
-        tc.checker._coverage.stub_missing = {stub_missing_module}
-    return tc, mock_node
+    from pathlib import Path
 
 
 # ── shared subprocess-integration helpers ──
@@ -1256,138 +73,3 @@ source-roots = ["{src}"]
         check=False,
     )
     return result.stdout + result.stderr
-
-
-# ── class-fidelity end-to-end rows ──
-
-_CLASS_FIDELITY_INTEGRATION_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "x: int = 1\n",
-        "\nx: int\nclass Foo: ...\n",
-        "stub-symbol-missing",
-        "E97B1",
-        id="integration_stub_symbol_missing",
-    ),
-    _p(
-        "Foo: int = 1\n",
-        "class Foo: ...\n",
-        "symbol-kind-mismatch",
-        "E97B2",
-        id="integration_kind_mismatch",
-    ),
-    _p(
-        "\nclass Foo:\n    x: int = 1\n",
-        "\nclass Foo(BaseModel):\n    x: int\n",
-        "annotation-mismatch",
-        "E97B4",
-        id="integration_base_class_mismatch",
-    ),
-    _p(
-        "x: str = 'hello'\n",
-        "x: int\n",
-        "annotation-mismatch",
-        "E97B4",
-        id="integration_variable_annotation_mismatch",
-    ),
-    _p(
-        "x = 1\n",
-        "x: int\n",
-        "impl-missing-annotation",
-        "W97B5",
-        id="integration_impl_missing_annotation",
-    ),
-]
-
-_CALLABLE_FIDELITY_INTEGRATION_CASES: list[
-    Any
-] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p(
-        "\ndef foo(x: int, y: str) -> None: ...\n",
-        "\ndef foo(x: int) -> None: ...\n",
-        "signature-mismatch",
-        "E97B3",
-        id="signature_mismatch",
-    ),
-    _p(
-        "\ndef foo() -> int: ...\n",
-        "\ndef foo() -> str: ...\n",
-        "annotation-mismatch",
-        "E97B4",
-        id="return_annotation_mismatch",
-    ),
-]
-
-
-# ── stub_class: shared walk-with-pair helper ──
-
-
-def walk_stub_checker_with_pair(
-    tmp_path: Path,
-    py_code: str,
-    pyi_code: str,
-    /,
-    module_name: str = "mod_a",
-) -> list[Any]:  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    from python_setup_lint.checkers.stub.checker import StubChecker
-
-    src = tmp_path / "src"
-    src.mkdir()
-    (src / f"{module_name}.py").write_text(py_code)
-    (src / f"{module_name}.pyi").write_text(pyi_code)
-    tc = _make_tc_factory(StubChecker)
-    tc.linter.config.source_roots = [str(src)]
-    tc.checker.open()
-    module = astroid.parse(py_code, module_name=module_name)
-    module.file = str(src / f"{module_name}.py")
-    tc.walk(module)
-    tc.checker.close()
-    return tc.linter.release_messages()
-
-
-# ── stub_checker: import-contract setup helper ──
-
-
-def setup_and_emit_import_contract(
-    *,
-    target_module: str,
-    has_stub: bool,
-    declared_symbols: set[str] | None,
-    importer: str,
-    symbol: str | None,
-    is_star: bool,
-    star_policy: str | None,
-) -> tuple[CheckerTestCase, list[Any]]:  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    from python_setup_lint.checkers.stub.import_contract import (
-        ImportUsage,
-        emit_import_contract_violations,
-    )
-
-    target_path_str = f"/workspace/src/{target_module}.py"
-    target_node = MagicMock()
-    target_node.name = target_module
-    module_index = {target_module: (Path(target_path_str), target_node)}
-    stub_index = {target_module: Path(f"/workspace/src/{target_module}.pyi")} if has_stub else {}
-    declaration_index = {target_module: declared_symbols} if declared_symbols is not None else {}
-    import_usages = [ImportUsage(importer, 1, target_module, symbol, None, is_star)]
-    checker, _tc = build_import_contract_state(
-        module_index=module_index,
-        stub_index=stub_index,
-        declaration_index=declaration_index,
-        import_usages=import_usages,
-    )
-    if star_policy is not None:
-        checker._coverage.star_import_policy = star_policy
-    emit_import_contract_violations(checker)
-    return _tc, _tc.linter.release_messages()
-
-
-# ── stub_checker: registered message codes ──
-
-_STUB_CHECKER_MSGS_CASES: list[Any] = [  # list[Any] is a test factory return type; Any needed for heterogeneous test cases
-    _p("E97A0", "missing-module-stub", id="E97A0"),
-    _p("E97A1", "missing-import-declaration", id="E97A1"),
-    _p("E97A2", "missing-module-stub-for-import", id="E97A2"),
-    _p("E97A3", "star-import-unresolvable", id="E97A3"),
-]
diff --git a/tests/checkers/_factories_beartype.py b/tests/checkers/_factories_beartype.py
new file mode 100644
index 0000000..2be129d
--- /dev/null
+++ b/tests/checkers/_factories_beartype.py
@@ -0,0 +1,43 @@
+"""Parametrize rows for ``BeartypeCoverageChecker`` tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_beartype_checker.py``.
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING
+
+import pytest
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── beartype checker ──
+
+_BEARTYPE_MISS_CASES: list[ParameterSet] = [
+    _p("def foo(): pass", 1, None, id="plain_def"),
+    _p("async def foo(): pass", 1, None, id="async_def"),
+    _p("class X:\n    def method(self): pass", 1, "method", id="public_method_in_class"),
+    _p("def foo(): pass\ndef bar(): pass\n", 2, None, id="multiple_public_functions"),
+]
+
+_BEARTYPE_SOURCE_ROOT_CASES: list[ParameterSet] = [
+    _p("def foo(): pass", "tests/test_mod.py", 0, id="outside_source_root"),
+    _p("def foo(): pass", "src/prod.py", 1, id="under_source_root"),
+]
+
+_BEARTYPE_SKIP_CASES: list[ParameterSet] = [
+    _p("def _helper(): pass", 0, id="private_function"),
+    _p("def public(): pass\ndef _private(): pass\n", 1, id="mixed_public_and_private"),
+    _p("class X:\n    def __init__(self): pass", 0, id="init_skipped"),
+    _p("class X:\n    def __str__(self): pass", 0, id="str_skipped"),
+    _p(
+        "class X:\n    def __init__(self): pass\n    def run(self): pass",
+        1,
+        id="dunder_only_init_skipped_then_public",
+    ),
+]
diff --git a/tests/checkers/_factories_no_try_import.py b/tests/checkers/_factories_no_try_import.py
new file mode 100644
index 0000000..b8e85a2
--- /dev/null
+++ b/tests/checkers/_factories_no_try_import.py
@@ -0,0 +1,95 @@
+"""Parametrize rows for ``NoTryImportChecker`` tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_no_try_import_checker.py``.
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING
+
+import pytest
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── no-try-import checker ──
+
+_NO_TRY_DETECT_CASES: list[ParameterSet] = [
+    _p(
+        "try:\n    import litellm\nexcept ImportError:\n    pass\n",
+        1,
+        ("ImportError",),
+        id="import_in_try_except_importerror",
+    ),
+    _p(
+        "try:\n    import litellm\nexcept ModuleNotFoundError:\n    pass\n",
+        1,
+        (),
+        id="import_in_try_except_modulenotfound",
+    ),
+    _p(
+        "try:\n    from pydantic import ValidationError\nexcept ImportError:\n    pass\n",
+        1,
+        (),
+        id="from_import_in_try_except_importerror",
+    ),
+    _p(
+        "try:\n    import httpx\nexcept:\n    pass\n",
+        1,
+        ("bare except",),
+        id="import_in_try_bare_except",
+    ),
+    _p(
+        "try:\n    import litellm\nexcept (ImportError, ModuleNotFoundError):\n    pass\n",
+        1,
+        (),
+        id="import_in_try_tuple_import_errors",
+    ),
+    _p(
+        "try:\n    import litellm\nexcept ImportError:\n    pass\n\ntry:\n    import httpx\nexcept ImportError:\n    pass\n",
+        2,
+        (),
+        id="two_imports_separate_try_blocks",
+    ),
+    _p(
+        "try:\n    import litellm\nexcept ImportError:\n    pass\nexcept ModuleNotFoundError:\n    pass\n",
+        2,
+        (),
+        id="two_imports_separate_handlers_one_try",
+    ),
+    _p(
+        "try:\n    import litellm\nexcept ValueError:\n    pass\n",
+        0,
+        (),
+        id="import_in_try_non_import_handler_not_flagged",
+    ),
+    _p(
+        "try:\n    import httpx\nexcept ValueError:\n    pass\nexcept ImportError:\n    pass\nexcept OSError:\n    pass\n",
+        1,
+        (),
+        id="handler_mixed_import_and_non_import",
+    ),
+    _p(
+        "try:\n    import litellm as _litellm\nexcept ImportError:\n    _litellm = None\n",
+        1,
+        (),
+        id="proxy_module_level_guard",
+    ),
+]
+
+_NO_TRY_DO_NOT_DETECT_CASES: list[ParameterSet] = [
+    _p(
+        "try:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    pass\n",
+        id="try_without_import",
+    ),
+    _p("import os\nx = os.path.join('a', 'b')\n", id="import_outside_try"),
+    _p("", id="empty_module"),
+    _p(
+        "try:\n    result = api_call()\nexcept ConnectionError:\n    result = None\n",
+        id="non_import_exception_handling",
+    ),
+]
diff --git a/tests/checkers/_factories_stub.py b/tests/checkers/_factories_stub.py
new file mode 100644
index 0000000..e7e72fb
--- /dev/null
+++ b/tests/checkers/_factories_stub.py
@@ -0,0 +1,474 @@
+"""Parametrize rows and state builders for ``StubChecker`` tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_checker.py``.
+"""
+
+from __future__ import annotations
+
+from pathlib import Path
+from typing import TYPE_CHECKING, Any
+from unittest.mock import MagicMock
+
+import astroid
+import pytest
+from pylint.testutils import CheckerTestCase
+
+from python_setup_lint.testing import _make_tc as _make_tc_factory
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+    from python_setup_lint.checkers.stub.checker import StubChecker
+    from python_setup_lint.checkers.stub.import_contract import ImportUsage
+
+_p = pytest.param
+
+
+# ── stub checker ──
+
+_STUB_FILE_CLASSIFICATION_CASES: list[ParameterSet] = [
+    _p(
+        "/workspace/tests/test_foo.py",
+        ["/workspace/src"],
+        None,
+        None,
+        0,
+        id="test_file_in_tests_dir",
+    ),
+    _p(
+        "/workspace/src/test_example.py",
+        ["/workspace/src"],
+        ["test_*.py", "tests/"],
+        None,
+        0,
+        id="test_file_named_test_prefixed",
+    ),
+    _p(
+        "/workspace/other/foo.py",
+        ["/workspace/src"],
+        None,
+        None,
+        0,
+        id="file_outside_source_root_skipped",
+    ),
+    _p(
+        "/workspace/src/generated/foo.py",
+        ["/workspace/src"],
+        None,
+        ["src/generated/"],
+        0,
+        id="opted_out_by_directory",
+    ),
+    _p(
+        "/workspace/src/vendor/external.py",
+        ["/workspace/src"],
+        None,
+        ["src/vendor/"],
+        0,
+        id="opted_out_by_filename",
+    ),
+]
+
+_RESOLVE_RELATIVE_CASES: list[ParameterSet] = [
+    _p("mod_a", 0, "os", False, "os", id="absolute_import"),
+    _p("mod_a", 0, None, False, "", id="absolute_no_modname"),
+    _p("mypkg", 1, None, True, "mypkg", id="same_package_init"),
+    _p("mypkg", 1, "mod_a", True, "mypkg.mod_a", id="same_package_init_with_name"),
+    _p("mypkg.mod_a", 2, "sibling", False, "sibling", id="parent_package"),
+    _p("pkg.sub.mod_a", 3, "other", False, "other", id="grandparent_package"),
+    _p("mod_a", 3, "other", True, "other", id="level_exceeds_depth"),
+]
+
+_IS_TYPE_CHECKING_GUARD_CASES: list[ParameterSet] = [
+    _p("TYPE_CHECKING", True, id="name_form"),
+    _p("typing.TYPE_CHECKING", True, id="typing_dot_name"),
+    _p("SOME_FLAG", False, id="other_name"),
+    _p("os.name", False, id="other_attribute"),
+]
+
+_IN_TYPE_CHECKING_BLOCK_POSITIVE_CASES: list[ParameterSet] = [
+    _p(
+        "if TYPE_CHECKING:\n    from foo import Bar\n",
+        lambda m: m.body[0].body[0],
+        id="under_type_checking",
+    ),
+    _p(
+        "if TYPE_CHECKING:\n    if True:\n        from foo import Bar\n",
+        lambda m: m.body[0].body[0].body[0],
+        id="nested_inside_type_checking",
+    ),
+]
+
+_IN_TYPE_CHECKING_BLOCK_NEGATIVE_CASES: list[ParameterSet] = [
+    _p("from foo import Bar\n", lambda m: m.body[0], id="not_under_type_checking"),
+]
+
+
+# ── stub_import_contract helpers ──
+
+
+def build_import_contract_state(
+    *,
+    module_index: dict[str, tuple[Path, Any]] | None = None,
+    stub_index: dict[str, Path] | None = None,
+    declaration_index: dict[str, set[str]] | None = None,
+    import_usages: list[ImportUsage] | None = None,
+) -> tuple[StubChecker, CheckerTestCase]:
+
+    tc = _make_tc_factory(_stub_checker_class())
+    c = tc.checker._coverage
+    if module_index is not None:
+        c.module_index = module_index
+    if stub_index is not None:
+        c.stub_index = stub_index
+    if declaration_index is not None:
+        c.declaration_index = declaration_index
+    if import_usages is not None:
+        c.import_usages = import_usages
+        for usage in import_usages:
+            if usage.importer_module not in c.module_index:
+                mock_node = MagicMock()
+                mock_node.name = usage.importer_module
+                mock_node.position = None
+                c.module_index[usage.importer_module] = (
+                    Path(f"/workspace/src/{usage.importer_module}.py"),
+                    mock_node,
+                )
+    return tc.checker, tc
+
+
+def _stub_checker_class() -> type[StubChecker]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    return StubChecker
+
+
+# ── stub_checker: import-usage / contract-violations tables ──
+
+_IMPORT_USAGE_FIELD_CASES: list[ParameterSet] = [
+    _p(
+        {
+            "importer_module": "mod_a",
+            "lineno": 5,
+            "target_module": "mod_b",
+            "symbol_name": "Foo",
+            "alias": None,
+            "is_star": False,
+        },
+        {
+            "importer_module": "mod_a",
+            "lineno": 5,
+            "target_module": "mod_b",
+            "symbol_name": "Foo",
+            "alias": None,
+            "is_star": False,
+        },
+        id="fields",
+    ),
+    _p(
+        {
+            "importer_module": "mod_a",
+            "lineno": 3,
+            "target_module": "mod_b",
+            "symbol_name": None,
+            "alias": None,
+            "is_star": False,
+        },
+        {"symbol_name": None},
+        id="module_import_symbol_name_none",
+    ),
+    _p(
+        {
+            "importer_module": "mod_a",
+            "lineno": 7,
+            "target_module": "mod_b",
+            "symbol_name": "*",
+            "alias": None,
+            "is_star": True,
+        },
+        {"is_star": True},
+        id="star_import_is_star",
+    ),
+]
+
+_IMPORT_CONTRACT_CASES: list[ParameterSet] = [
+    _p(
+        "mod_a",
+        False,
+        None,
+        "mod_a",
+        "Foo",
+        False,
+        None,
+        "missing-module-stub-for-import",
+        1,
+        id="e97a2_when_target_no_stub",
+    ),
+    _p(
+        "mod_b",
+        True,
+        {"Foo"},
+        "mod_a",
+        "Bar",
+        False,
+        None,
+        "missing-import-declaration",
+        1,
+        id="e97a1_when_symbol_not_declared",
+    ),
+    _p(
+        "mod_b",
+        True,
+        {"Foo"},
+        "mod_a",
+        "Foo",
+        False,
+        None,
+        None,
+        0,
+        id="no_violation_when_symbol_declared",
+    ),
+    _p(
+        "mod_b",
+        True,
+        None,
+        "mod_a",
+        "*",
+        True,
+        "error",
+        "star-import-unresolvable",
+        1,
+        id="e97a3_star_import",
+    ),
+]
+
+_STAR_POLICY_CASES: list[ParameterSet] = [
+    _p("error", 1, id="star_policy_error"),
+    _p("ignore", 0, id="star_policy_ignore"),
+]
+
+_VARIABLE_FIDELITY_CASES: list[ParameterSet] = [
+    _p("ClassVar[int]", True, id="classvar_skipped"),
+    _p("int", False, id="non_classvar"),
+]
+
+
+# ── stub_checker: shared walk helpers ──
+
+
+def walk_stub_close_release(
+    code: str,
+    file_path: str,
+    *,
+    source_roots: list[str] | None = None,
+    test_patterns: list[str] | None = None,
+    stub_opt_out: list[str] | None = None,
+    stub_roots: list[str] | None = None,
+    module_name: str = "test_module",
+) -> list[Any]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    tc = _make_tc_factory(StubChecker)
+    if source_roots is not None:
+        tc.linter.config.source_roots = source_roots
+    if test_patterns is not None:
+        tc.linter.config.test_patterns = test_patterns
+    if stub_opt_out is not None:
+        tc.linter.config.stub_opt_out = stub_opt_out
+    if stub_roots is not None:
+        tc.linter.config.stub_roots = stub_roots
+    module = astroid.parse(code, module_name=module_name)
+    module.file = file_path
+    tc.checker.open()
+    tc.walk(module)
+    tc.checker.close()
+    return tc.linter.release_messages()
+
+
+# ── T1-pyi-exemption layout rows ──
+
+_PYI_EXEMPT_LOG_LAYOUT_CASES: list[ParameterSet] = [
+    _p(
+        "init",
+        "from .sub import Foo\n",
+        "Exempt __init__.py",
+        id="init_exempt_logs_record",
+    ),
+    _p(
+        "main",
+        "\ndef run():\n    pass\nif __name__ == '__main__':\n    run()\n",
+        "Exempt standalone script",
+        id="main_exempt_logs_record",
+    ),
+    _p(
+        "conftest",
+        "import pytest\n",
+        "Exempt conftest.py",
+        id="conftest_exempt_logs_record",
+    ),
+    _p(
+        "trivial_data",
+        "x = 1\ny = 'hello'\n",
+        "Exempt trivial test data module",
+        id="trivial_test_data_exempt_logs_record",
+    ),
+]
+
+
+def materialize_pyi_exempt_layout(
+    tmp_path: Path,
+    layout_kind: str,
+    code: str,
+    /,
+) -> tuple[str, list[str], str]:
+    src = tmp_path / "src"
+    if layout_kind == "init":
+        pkg = src / "mypkg"
+        pkg.mkdir(parents=True)
+        (pkg / "__init__.py").write_text(code)
+        return str(pkg / "__init__.py"), [str(src)], "mypkg"
+    if layout_kind == "main":
+        src.mkdir()
+        (src / "script.py").write_text(code)
+        return str(src / "script.py"), [str(src)], "script"
+    if layout_kind == "conftest":
+        src.mkdir()
+        (src / "conftest.py").write_text(code)
+        return str(src / "conftest.py"), [str(src)], "conftest_root"
+    if layout_kind == "trivial_data":
+        data_dir = tmp_path / "tests" / "data"
+        data_dir.mkdir(parents=True)
+        data_file = data_dir / "fixture_data.py"
+        data_file.write_text(code)
+        return str(data_file), [str(tmp_path / "src")], "tests.data.fixture_data"
+    raise ValueError(f"unknown layout_kind {layout_kind!r}")
+
+
+# ── stub_checker: import-contract / star-policy state builders ──
+
+
+def _build_star_import_policy_state(star_policy: str, import_usage_factory: Any, /) -> tuple[CheckerTestCase, StubChecker]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    mock_b = MagicMock()
+    mock_b.name = "mod_b"
+    mock_b.position = None
+    mock_a = MagicMock()
+    mock_a.name = "mod_a"
+    mock_a.position = None
+    tc = _make_tc_factory(StubChecker)
+    tc.checker._coverage.module_index = {
+        "mod_a": (Path("/workspace/src/mod_a.py"), mock_a),
+        "mod_b": (Path("/workspace/src/mod_b.py"), mock_b),
+    }
+    tc.checker._coverage.stub_index = {"mod_b": Path("/workspace/src/mod_b.pyi")}
+    tc.checker._coverage.star_import_policy = star_policy
+    tc.checker._coverage.import_usages = [import_usage_factory()]
+    return tc, tc.checker
+
+
+def _star_usage_factory() -> ImportUsage:
+    from python_setup_lint.checkers.stub.import_contract import ImportUsage
+
+    return ImportUsage("mod_a", 1, "mod_b", "*", None, True)
+
+
+# ── stub_checker: .pyi companion-resolution ──
+
+_STUB_RESOLUTION_CASES: list[ParameterSet] = [
+    _p("inline", "x = 1\n", "has_stub", 0, id="inline_stub_detected"),
+    _p("package", "x = 1\n", "mypkg", 0, id="package_init_stub_detected"),
+    _p("stub_root", "x = 1\n", "foo", 0, id="stub_root_resolution"),
+    _p("no_stub", "y = 2\n", "unstubbed", 1, id="missing_stub_emits_e97a0"),
+    _p("empty", "", "", 0, id="no_stub_no_error_on_empty"),
+]
+
+
+def walk_stub_resolution_layout(
+    tmp_path: Path,
+    layout_kind: str,
+    code: str,
+    module_name: str,
+    /,
+) -> list[Any]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    tc = _make_tc_factory(StubChecker)
+    if layout_kind == "empty":
+        tc.checker.open()
+        tc.checker.close()
+        return tc.linter.release_messages()
+    src = tmp_path / "src"
+    src.mkdir()
+    tc.linter.config.source_roots = [str(src)]
+    py_file = src / f"{module_name}.py"
+    pyi_file: Path | None = None
+    if layout_kind == "package":
+        pkg = src / module_name
+        pkg.mkdir(parents=True)
+        py_file = pkg / "__init__.py"
+        pyi_file = pkg / "__init__.pyi"
+    elif layout_kind == "stub_root":
+        stub_root = tmp_path / "stubs"
+        stub_root.mkdir()
+        pyi_file = stub_root / f"{module_name}.pyi"
+        tc.linter.config.stub_roots = [str(stub_root)]
+    elif layout_kind == "inline":
+        pyi_file = src / f"{module_name}.pyi"
+    py_file.write_text(code)
+    if pyi_file is not None:
+        pyi_file.write_text("x: int\n")
+    tc.checker.open()
+    module = astroid.parse(code, module_name=module_name)
+    module.file = str(py_file)
+    tc.walk(module)
+    tc.checker.close()
+    return tc.linter.release_messages()
+
+
+# ── stub_checker: import-contract setup helper ──
+
+
+def setup_and_emit_import_contract(
+    *,
+    target_module: str,
+    has_stub: bool,
+    declared_symbols: set[str] | None,
+    importer: str,
+    symbol: str | None,
+    is_star: bool,
+    star_policy: str | None,
+) -> tuple[CheckerTestCase, list[Any]]:
+    from python_setup_lint.checkers.stub.import_contract import (
+        ImportUsage,
+        emit_import_contract_violations,
+    )
+
+    target_path_str = f"/workspace/src/{target_module}.py"
+    target_node = MagicMock()
+    target_node.name = target_module
+    module_index = {target_module: (Path(target_path_str), target_node)}
+    stub_index = {target_module: Path(f"/workspace/src/{target_module}.pyi")} if has_stub else {}
+    declaration_index = {target_module: declared_symbols} if declared_symbols is not None else {}
+    import_usages = [ImportUsage(importer, 1, target_module, symbol, None, is_star)]
+    checker, _tc = build_import_contract_state(
+        module_index=module_index,
+        stub_index=stub_index,
+        declaration_index=declaration_index,
+        import_usages=import_usages,
+    )
+    if star_policy is not None:
+        checker._coverage.star_import_policy = star_policy
+    emit_import_contract_violations(checker)
+    return _tc, _tc.linter.release_messages()
+
+
+# ── stub_checker: registered message codes ──
+
+_STUB_CHECKER_MSGS_CASES: list[ParameterSet] = [
+    _p("E97A0", "missing-module-stub", id="E97A0"),
+    _p("E97A1", "missing-import-declaration", id="E97A1"),
+    _p("E97A2", "missing-module-stub-for-import", id="E97A2"),
+    _p("E97A3", "star-import-unresolvable", id="E97A3"),
+]
diff --git a/tests/checkers/_factories_stub_callable.py b/tests/checkers/_factories_stub_callable.py
new file mode 100644
index 0000000..26cacb2
--- /dev/null
+++ b/tests/checkers/_factories_stub_callable.py
@@ -0,0 +1,163 @@
+"""Parametrize rows for callable-fidelity stub checks.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_checker_callable.py``.
+"""
+
+from __future__ import annotations
+
+import inspect
+from typing import TYPE_CHECKING
+
+import pytest
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── stub_callable: extract param descriptors ──
+
+_EXTRACT_PARAM_CASES: list[ParameterSet] = [
+    _p("def foo() -> None: ...", [], [], id="empty_function"),
+    _p(
+        "def foo(a, b, /) -> None: ...",
+        ["a", "b"],
+        [inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_ONLY],
+        id="positional_only",
+    ),
+    _p(
+        "def foo(a, b) -> None: ...",
+        ["a", "b"],
+        [
+            inspect.Parameter.POSITIONAL_OR_KEYWORD,
+            inspect.Parameter.POSITIONAL_OR_KEYWORD,
+        ],
+        id="positional_or_keyword",
+    ),
+    _p(
+        "def foo(*args) -> None: ...",
+        ["args"],
+        [inspect.Parameter.VAR_POSITIONAL],
+        id="var_positional",
+    ),
+    _p(
+        "def foo(*, x, y) -> None: ...",
+        ["x", "y"],
+        [inspect.Parameter.KEYWORD_ONLY, inspect.Parameter.KEYWORD_ONLY],
+        id="keyword_only",
+    ),
+    _p(
+        "def foo(**kwargs) -> None: ...",
+        ["kwargs"],
+        [inspect.Parameter.VAR_KEYWORD],
+        id="var_keyword",
+    ),
+]
+
+_EXTRACT_DEFAULT_CASES: list[ParameterSet] = [
+    _p("def foo(a, b=1) -> None: ...", [False, True], id="default_presence_detected"),
+    _p(
+        "def foo(*, x, y='hello') -> None: ...",
+        [False, True],
+        id="default_presence_kwonly",
+    ),
+]
+
+_EXTRACT_STRIP_SELF_CASES: list[ParameterSet] = [
+    _p("def bar(self, x, y) -> None: ...", True, ["x", "y"], id="strip_self"),
+    _p("def bar(cls, x, y) -> None: ...", True, ["x", "y"], id="strip_cls"),
+    _p("def bar(a, b) -> None: ...", True, ["a", "b"], id="no_strip_non_method"),
+]
+
+_EXTRACT_ANNOTATION_CASES: list[ParameterSet] = [
+    _p(
+        "def foo(x: int, y: str | None) -> None: ...",
+        "int",
+        None,
+        id="annotations_extracted",
+    ),
+    _p("def foo(*args: int) -> None: ...", "int", None, id="vararg_annotation"),
+    _p("def foo(**kwargs: str) -> None: ...", "str", None, id="kwarg_annotation"),
+]
+
+
+# ── stub_callable: compare descriptors ──
+
+_COMPARE_DESCRIPTOR_CASES: list[ParameterSet] = [
+    _p(
+        [
+            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+        ],
+        [
+            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+        ],
+        None,
+        id="identical_params",
+    ),
+    _p(
+        [
+            ("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+            ("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False),
+        ],
+        [("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
+        "param_count",
+        id="param_count_mismatch",
+    ),
+    _p(
+        [("a", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
+        [("b", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
+        "param_name",
+        id="param_name_mismatch",
+    ),
+    _p(
+        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
+        [("x", inspect.Parameter.KEYWORD_ONLY, False)],
+        "param_kind",
+        id="param_kind_mismatch",
+    ),
+    _p(
+        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, True)],
+        [("x", inspect.Parameter.POSITIONAL_OR_KEYWORD, False)],
+        "param_default",
+        id="default_presence_mismatch",
+    ),
+    _p([], [], None, id="empty_lists"),
+]
+
+_COMPARE_ANNOTATION_CASES: list[ParameterSet] = [
+    _p(["int", "str"], ["int", "str"], 0, None, id="all_match_returns_empty"),
+    _p(["int", "str"], ["int", "int"], 1, "y", id="param_annotation_mismatch_detected"),
+    _p([None], ["int"], 0, None, id="skips_missing_annotations"),
+    _p([None], [None], 0, None, id="skips_no_annotation_on_both"),
+]
+
+_COMPARE_RETURN_CASES: list[ParameterSet] = [
+    _p(None, None, "skip_both_none", True, id="both_none"),
+    _p(None, "int", "skip_both_none", True, id="stub_none_skipped"),
+    _p("int", None, "skip_both_none", True, id="impl_none_skipped"),
+    _p("int", "int", "compare", True, id="matching_returns"),
+    _p("str", "int", "compare", False, id="mismatched_returns"),
+    _p("typing.List[int]", "list[int]", "compare", True, id="normalized_typing"),
+]
+
+
+_CALLABLE_FIDELITY_INTEGRATION_CASES: list[ParameterSet] = [
+    _p(
+        "\ndef foo(x: int, y: str) -> None: ...\n",
+        "\ndef foo(x: int) -> None: ...\n",
+        "signature-mismatch",
+        "E97B3",
+        id="signature_mismatch",
+    ),
+    _p(
+        "\ndef foo() -> int: ...\n",
+        "\ndef foo() -> str: ...\n",
+        "annotation-mismatch",
+        "E97B4",
+        id="return_annotation_mismatch",
+    ),
+]
diff --git a/tests/checkers/_factories_stub_class.py b/tests/checkers/_factories_stub_class.py
new file mode 100644
index 0000000..026f40e
--- /dev/null
+++ b/tests/checkers/_factories_stub_class.py
@@ -0,0 +1,165 @@
+"""Parametrize rows and walker for class-fidelity stub checks.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_checker_class.py``.
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING, Any
+
+import astroid
+import pytest
+
+from python_setup_lint.testing import _make_tc as _make_tc_factory
+
+if TYPE_CHECKING:
+    from pathlib import Path
+
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── stub_class fidelity: _normalize_bases ──
+
+_NORMALIZE_BASES_CASES: list[ParameterSet] = [
+    _p("class Foo(BaseModel): ...\n", ["BaseModel"], id="simple_name"),
+    _p("class Foo(pydantic.BaseModel): ...\n", ["BaseModel"], id="attribute_base"),
+    _p("class Foo(object): ...\n", ["builtins.object"], id="builtins_object"),
+    _p("class Foo(B, A, C): ...\n", ["A", "B", "C"], id="multiple_bases_sorted"),
+    _p("class Foo(Generic[T]): ...\n", ["Generic"], id="subscript_base"),
+]
+
+_IS_PUBLIC_METHOD_CASES: list[ParameterSet] = [
+    _p("foo", True, id="plain_name"),
+    _p("_helper", False, id="private_name"),
+    _p("__str__", False, id="dunder_str"),
+    _p("__init__", True, id="init"),
+    _p("__new__", True, id="new"),
+    _p("__repr__", False, id="repr"),
+]
+
+
+# ── stub_class: E97B1 / E97B2 ──
+
+_STUB_SYMBOL_MISSING_CASES: list[ParameterSet] = [
+    _p(
+        "x: int = 1\n",
+        "x: int\nclass Foo: ...\n",
+        "stub-symbol-missing",
+        1,
+        "Foo",
+        id="stub_class_missing_from_impl",
+    ),
+    _p(
+        "x: int = 1\n",
+        "x: int\ndef foo(): ...\n",
+        "stub-symbol-missing",
+        1,
+        "foo",
+        id="stub_func_missing_from_impl",
+    ),
+    _p(
+        "x: int = 1\n",
+        "x: int\ny: str\n",
+        "stub-symbol-missing",
+        1,
+        "y",
+        id="stub_var_missing_from_impl",
+    ),
+]
+
+_KIND_MISMATCH_CASES: list[ParameterSet] = [
+    _p(
+        "Foo: int = 1\n",
+        "class Foo: ...\n",
+        "symbol-kind-mismatch",
+        id="stub_class_impl_var",
+    ),
+    _p(
+        "foo: int = 1\n",
+        "def foo(): ...\n",
+        "symbol-kind-mismatch",
+        id="stub_func_impl_var",
+    ),
+    _p(
+        "def Foo(): ...\n",
+        "class Foo: ...\n",
+        "symbol-kind-mismatch",
+        id="stub_class_impl_func",
+    ),
+    _p(
+        "class Foo: ...\n",
+        "Foo: int\n",
+        "symbol-kind-mismatch",
+        id="stub_var_impl_class",
+    ),
+]
+
+
+# ── class-fidelity end-to-end rows ──
+
+_CLASS_FIDELITY_INTEGRATION_CASES: list[ParameterSet] = [
+    _p(
+        "x: int = 1\n",
+        "\nx: int\nclass Foo: ...\n",
+        "stub-symbol-missing",
+        "E97B1",
+        id="integration_stub_symbol_missing",
+    ),
+    _p(
+        "Foo: int = 1\n",
+        "class Foo: ...\n",
+        "symbol-kind-mismatch",
+        "E97B2",
+        id="integration_kind_mismatch",
+    ),
+    _p(
+        "\nclass Foo:\n    x: int = 1\n",
+        "\nclass Foo(BaseModel):\n    x: int\n",
+        "annotation-mismatch",
+        "E97B4",
+        id="integration_base_class_mismatch",
+    ),
+    _p(
+        "x: str = 'hello'\n",
+        "x: int\n",
+        "annotation-mismatch",
+        "E97B4",
+        id="integration_variable_annotation_mismatch",
+    ),
+    _p(
+        "x = 1\n",
+        "x: int\n",
+        "impl-missing-annotation",
+        "W97B5",
+        id="integration_impl_missing_annotation",
+    ),
+]
+
+
+# ── stub_class: shared walk-with-pair helper ──
+
+
+def walk_stub_checker_with_pair(
+    tmp_path: Path,
+    py_code: str,
+    pyi_code: str,
+    /,
+    module_name: str = "mod_a",
+) -> list[Any]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    src = tmp_path / "src"
+    src.mkdir()
+    (src / f"{module_name}.py").write_text(py_code)
+    (src / f"{module_name}.pyi").write_text(pyi_code)
+    tc = _make_tc_factory(StubChecker)
+    tc.linter.config.source_roots = [str(src)]
+    tc.checker.open()
+    module = astroid.parse(py_code, module_name=module_name)
+    module.file = str(src / f"{module_name}.py")
+    tc.walk(module)
+    tc.checker.close()
+    return tc.linter.release_messages()
diff --git a/tests/checkers/_factories_stub_coverage.py b/tests/checkers/_factories_stub_coverage.py
new file mode 100644
index 0000000..42bafb3
--- /dev/null
+++ b/tests/checkers/_factories_stub_coverage.py
@@ -0,0 +1,257 @@
+"""Parametrize rows and layout builders for stub-coverage tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_coverage.py``.
+"""
+
+from __future__ import annotations
+
+from pathlib import Path
+from typing import TYPE_CHECKING, Any
+from unittest.mock import MagicMock
+
+import pytest
+from pylint.testutils import CheckerTestCase
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+_p = pytest.param
+
+
+# ── stub coverage helper tests ──
+
+_MATCHES_PATH_CASES: list[ParameterSet] = [
+    _p("/workspace/src/foo.py", [], False, id="empty_patterns_returns_false"),
+    _p("src/generated/foo.py", ["src/generated/"], True, id="directory_prefix_match"),
+    _p(
+        "/workspace/src/generated/foo.py",
+        ["src/generated/"],
+        True,
+        id="directory_prefix_with_leading_slash",
+    ),
+    _p(
+        "/workspace/src/handwritten/foo.py",
+        ["src/generated/"],
+        False,
+        id="directory_prefix_no_match",
+    ),
+    _p("/workspace/src/test_example.py", ["test_*.py"], True, id="fnmatch_full_path"),
+    _p("/workspace/src/foo/bar_test.py", ["*_test.py"], True, id="fnmatch_basename"),
+    _p("/workspace/src/prod.py", ["test_*.py"], False, id="fnmatch_no_match"),
+    _p("src\\generated\\foo.py", ["src\\generated\\"], True, id="backslash_pattern"),
+    _p(
+        "/workspace/tests/test_foo.py",
+        ["tests/", "test_*.py", "*_test.py"],
+        True,
+        id="multiple_patterns_any_match",
+    ),
+    _p(
+        "/workspace/src/prod.py",
+        ["tests/", "test_*.py"],
+        False,
+        id="multiple_patterns_none_match",
+    ),
+]
+
+_DEFAULT_TEST_PATTERNS = ["tests/", "test_*.py", "*_test.py", "conftest.py"]
+
+_IS_TEST_FILE_CASES: list[ParameterSet] = [
+    _p(
+        "/workspace/tests/test_foo.py",
+        _DEFAULT_TEST_PATTERNS,
+        True,
+        id="tests_dir_match",
+    ),
+    _p(
+        "/workspace/src/test_example.py",
+        _DEFAULT_TEST_PATTERNS,
+        True,
+        id="test_prefixed_filename",
+    ),
+    _p(
+        "/workspace/src/foo_test.py",
+        _DEFAULT_TEST_PATTERNS,
+        True,
+        id="suffixed_filename",
+    ),
+    _p("/workspace/src/conftest.py", _DEFAULT_TEST_PATTERNS, True, id="conftest"),
+    _p(
+        "/workspace/src/prod.py",
+        _DEFAULT_TEST_PATTERNS,
+        False,
+        id="production_file_not_test",
+    ),
+]
+
+_IS_TEST_FILE_CUSTOM_CASES: list[ParameterSet] = [
+    _p("/workspace/specs/test_foo.py", ["specs/"], True, id="custom_pattern_matches"),
+    _p(
+        "/workspace/tests/test_foo.py",
+        ["specs/"],
+        False,
+        id="custom_pattern_excludes_tests",
+    ),
+]
+
+_IS_OPTED_OUT_CASES: list[ParameterSet] = [
+    _p(
+        "/workspace/src/generated/foo.py",
+        ["src/generated/"],
+        True,
+        id="opted_out_by_directory",
+    ),
+    _p(
+        "/workspace/src/handwritten/foo.py",
+        ["src/generated/"],
+        False,
+        id="not_opted_out",
+    ),
+    _p(
+        "/workspace/src/vendor_foo.py",
+        ["vendor_*.py"],
+        True,
+        id="opted_out_by_filename",
+    ),
+    _p("/workspace/src/foo.py", [], False, id="empty_opt_out"),
+]
+
+_IS_INIT_EXEMPT_CASES: list[ParameterSet] = [
+    _p("", True, id="empty_body_exempt"),
+    _p("from .sub import Foo\nimport os\n", True, id="only_imports_exempt"),
+    _p("__all__ = ['Foo', 'Bar']\n", True, id="all_assignment_exempt"),
+    _p("def __getattr__(name): ...\n", False, id="getattr_defined_not_exempt"),
+    _p("def helper(): pass\n", False, id="function_def_not_exempt"),
+    _p("class Helper: pass\n", False, id="class_def_not_exempt"),
+    _p("setup(name='foo')\n", False, id="standalone_expression_not_exempt"),
+    _p("x = 1\n", False, id="non_all_assignment_not_exempt"),
+    _p("x: int = 1\n", False, id="ann_assign_not_exempt"),
+    _p("__version__: str = _version('x')\n", True, id="version_ann_assign_exempt"),
+    _p("__all__: list[str] = []\n", True, id="all_ann_assign_exempt"),
+    _p(
+        "__version__: str = _version('x')\n__all__: list[str] = []\n",
+        True,
+        id="init_metadata_exempt",
+    ),
+    _p("import os\nif os.name == 'nt':\n    x = 1\n", False, id="if_block_not_exempt"),
+]
+
+_IS_TRIVIAL_TEST_DATA_CASES: list[ParameterSet] = [
+    _p("", True, id="empty_module_trivial"),
+    _p("x = 1\ny = 'hello'\nz = 3.14\n", True, id="literal_assignments_trivial"),
+    _p("def helper(): pass\n", False, id="function_def_not_trivial"),
+    _p("class Data: pass\n", False, id="class_def_not_trivial"),
+    _p("import os\n", False, id="import_not_trivial"),
+    _p("1 + 1\n", False, id="expression_not_trivial"),
+    _p("x = 1\nif True:\n    y = 2\n", False, id="if_block_not_trivial"),
+]
+
+_HAS_MAIN_BLOCK_CASES: list[ParameterSet] = [
+    _p("if __name__ == '__main__':\n    main()\n", True, id="double_equals"),
+    _p('if __name__ == "__main__":\n    main()\n', True, id="double_quotes"),
+    _p("def foo(): pass\n", False, id="no_main_block"),
+    _p("if __name__ != '__main__':\n    pass\n", False, id="different_condition"),
+    _p("", False, id="empty_module"),
+]
+
+_IS_UNDER_SOURCE_ROOT_CASES: list[ParameterSet] = [
+    _p("/workspace/src/prod.py", ["/workspace/src"], True, id="path_under_root"),
+    _p("/workspace/tests/foo.py", ["/workspace/src"], False, id="path_not_under_root"),
+    _p(
+        "/workspace/lib/foo.py",
+        ["/workspace/src", "/workspace/lib"],
+        True,
+        id="multiple_roots",
+    ),
+]
+
+
+# ── stub_coverage: shared checker construction ──
+
+
+def make_coverage_checker(**config_kwargs: Any) -> tuple[StubChecker, CheckerTestCase]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    tc = CheckerTestCase()
+    tc.CHECKER_CLASS = StubChecker
+    tc.setup_method()
+    for key, value in config_kwargs.items():
+        setattr(tc.linter.config, key, value)
+    tc.checker.open()
+    return tc.checker, tc
+
+
+# ── stub_coverage: _resolve_stub layout ──
+
+_RESOLVE_STUB_CASES: list[ParameterSet] = [
+    _p("inline", "returns_pyi", id="inline_stub"),
+    _p("package", "returns_pyi", id="package_init_stub"),
+    _p("no_stub", "returns_none", id="no_stub_returns_none"),
+    _p("stub_root", "returns_pyi", id="stub_root_resolution"),
+]
+
+
+def materialize_resolve_stub_layout(tmp_path: Path, layout_kind: str, /) -> tuple[StubChecker, Path, Path | None]:
+    if layout_kind == "inline":
+        py_path = tmp_path / "mod.py"
+        py_path.write_text("x = 1\n")
+        stub_path = tmp_path / "mod.pyi"
+        stub_path.write_text("x: int\n")
+        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
+        return checker, py_path, stub_path
+    if layout_kind == "package":
+        pkg = tmp_path / "mypkg"
+        pkg.mkdir()
+        py_path = pkg / "__init__.py"
+        py_path.write_text("x = 1\n")
+        stub_path = pkg / "__init__.pyi"
+        stub_path.write_text("x: int\n")
+        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
+        return checker, py_path, stub_path
+    if layout_kind == "no_stub":
+        py_path = tmp_path / "mod.py"
+        py_path.write_text("x = 1\n")
+        checker, _tc = make_coverage_checker(source_roots=[str(tmp_path)])
+        return checker, py_path, None
+    src = tmp_path / "src"
+    src.mkdir()
+    py_path = src / "mod.py"
+    py_path.write_text("x = 1\n")
+    stub_root = tmp_path / "stubs"
+    stub_root.mkdir()
+    stub_path = stub_root / "mod.pyi"
+    stub_path.write_text("x: int\n")
+    checker, _tc = make_coverage_checker(source_roots=[str(src)], stub_roots=[str(stub_root)])
+    return checker, py_path, stub_path
+
+
+# ── stub_coverage: emit_coverage_violations ──
+
+_EMIT_COVERAGE_CASES: list[ParameterSet] = [
+    _p("in_index", "mod_a", 1, id="one_missing_module"),
+    _p("no_missing", "", 0, id="no_missing_emits_nothing"),
+    _p("skip_module_not_in_index", "ghost_module", 0, id="skip_module_not_in_index"),
+]
+
+
+def make_emit_coverage_state(tmp_path: Path, setup_kind: str, stub_missing_module: str, /) -> tuple[CheckerTestCase, MagicMock]:
+    from python_setup_lint.checkers.stub.checker import StubChecker
+
+    tc = CheckerTestCase()
+    tc.CHECKER_CLASS = StubChecker
+    tc.setup_method()
+    mock_node = MagicMock()
+    mock_node.name = stub_missing_module or "anon"
+    if not stub_missing_module:
+        tc.checker._coverage.stub_missing = set()
+    elif setup_kind == "in_index":
+        tc.checker._coverage.module_index[stub_missing_module] = (
+            tmp_path / f"{stub_missing_module}.py",
+            mock_node,
+        )
+        tc.checker._coverage.stub_missing = {stub_missing_module}
+    else:
+        tc.checker._coverage.stub_missing = {stub_missing_module}
+    return tc, mock_node
diff --git a/tests/checkers/_factories_stub_docstring.py b/tests/checkers/_factories_stub_docstring.py
new file mode 100644
index 0000000..a20b613
--- /dev/null
+++ b/tests/checkers/_factories_stub_docstring.py
@@ -0,0 +1,178 @@
+"""Parametrize rows and walker for ``StubDocstringChecker`` tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_docstring_checker.py``.
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING, Any
+
+import astroid
+import pytest
+
+if TYPE_CHECKING:
+    from pathlib import Path
+
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── stub docstring checker ──
+
+_DOCSTRING_NO_COMPANION_CASES: list[ParameterSet] = [
+    _p(
+        'def foo():\n    """My docstring."""\n    pass\n',
+        0,
+        id="no_companion_plain_func",
+    ),
+    _p(
+        'async def foo():\n    """My docstring."""\n    pass\n',
+        0,
+        id="no_companion_async_func",
+    ),
+    _p(
+        'class MyClass:\n    def method(self):\n        """Method doc."""\n        pass\n',
+        0,
+        id="no_companion_method",
+    ),
+]
+
+_DOCSTRING_DOES_NOT_DETECT_CASES: list[ParameterSet] = [
+    _p("def foo():\n    pass\n", id="no_docstring_no_message"),
+    _p("def foo():\n    ...\n", id="empty_body_no_message"),
+    _p(
+        'class MyClass:\n    """Class-level docs."""\n    pass\n',
+        id="class_docstring_no_message",
+    ),
+    _p("def foo():\n    42\n    pass\n", id="non_string_first_expr"),
+]
+
+_DOCSTRING_DETECT_CASES: list[ParameterSet] = [
+    _p(
+        'def foo():\n    """Usage docstring."""\n    pass\n',
+        1,
+        "foo",
+        id="function_docstring_detected",
+    ),
+    _p(
+        'async def foo():\n    """Usage docstring."""\n    pass\n',
+        1,
+        None,
+        id="async_function_docstring_detected",
+    ),
+    _p(
+        'class MyClass:\n    def method(self):\n        """Method doc."""\n        pass\n',
+        1,
+        "method",
+        id="method_docstring_detected",
+    ),
+    _p(
+        'def foo():\n    """Doc."""\n    pass\n\ndef bar():\n    pass\n',
+        1,
+        None,
+        id="mixed_docstrings_and_no_docstrings",
+    ),
+]
+
+_DOCSTRING_RETURNS_DETECT_CASES: list[ParameterSet] = [
+    _p(
+        'def f() -> int:\n    """Do something."""\n    return 1\n',
+        1,
+        id="generic_int_fires",
+    ),
+    _p(
+        'def f() -> str:\n    """Do something."""\n    return "x"\n',
+        1,
+        id="generic_str_fires",
+    ),
+    _p(
+        'def f() -> bool:\n    """Do something."""\n    return True\n',
+        1,
+        id="generic_bool_fires",
+    ),
+    _p(
+        'def f() -> dict[str, int]:\n    """Do something."""\n    return {}\n',
+        1,
+        id="generic_dict_str_fires",
+    ),
+    _p(
+        'def f() -> dict[int, str]:\n    """Do something."""\n    return {}\n',
+        1,
+        id="generic_dict_int_fires",
+    ),
+]
+
+_DOCSTRING_RETURNS_DO_NOT_DETECT_CASES: list[ParameterSet] = [
+    _p(
+        'def f() -> UserId:\n    """Do something."""\n    return UserId(1)\n',
+        id="named_alias_skips",
+    ),
+    _p(
+        'def _helper() -> int:\n    """Do something."""\n    return 1\n',
+        id="underscore_prefixed_skips",
+    ),
+    _p(
+        'def f() -> None:\n    """Do something."""\n    pass\n',
+        id="none_return_skips",
+    ),
+    _p(
+        "def f() -> int:\n    pass\n",
+        id="no_docstring_skips",
+    ),
+    _p(
+        'def f() -> int:\n    """Do something.\n\n    Returns:\n        The answer.\n    """\n    return 42\n',
+        id="has_returns_clause_skips",
+    ),
+    _p(
+        'def f() -> int:\n    """Do something.\n\n    Yields:\n        Items.\n    """\n    yield 1\n',
+        id="has_yields_clause_skips",
+    ),
+    _p(
+        'def f() -> Self:\n    """Do something."""\n    return self\n',
+        id="self_return_skips",
+    ),
+    _p(
+        'def f() -> NoReturn:\n    """Do something."""\n    sys.exit(1)\n',
+        id="noreturn_skips",
+    ),
+    _p(
+        'def f() -> MyClass:\n    """Do something."""\n    return MyClass()\n',
+        id="custom_class_skips",
+    ),
+]
+
+
+# ── stub_docstring: shared walker ──
+
+
+def walk_both_release_for_pyi(
+    code: str,
+    py_path: Path,
+    source_roots: list[str] | None = None,
+) -> list[Any]:
+    from pylint.testutils import UnittestLinter
+    from pylint.utils import ASTWalker
+
+    from python_setup_lint.checkers.stub.checker import StubChecker
+    from python_setup_lint.checkers.stub.docstring_checker import StubDocstringChecker
+
+    pyi_path = py_path.with_suffix(".pyi")
+    pyi_path.parent.mkdir(parents=True, exist_ok=True)
+    pyi_path.write_text("# stub\n")
+    module_name = py_path.stem
+    linter = UnittestLinter()
+    stub = StubChecker(linter)
+    stub_doc = StubDocstringChecker(linter)
+    linter.register_checker(stub_doc)
+    if source_roots:
+        linter.config.source_roots = source_roots
+    stub.open()
+    module = astroid.parse(code, module_name=module_name)
+    module.file = str(py_path)
+    walker = ASTWalker(linter)
+    walker.add_checker(stub)
+    walker.add_checker(stub_doc)
+    walker.walk(module)
+    return linter.release_messages()
diff --git a/tests/checkers/_factories_stub_normalizer.py b/tests/checkers/_factories_stub_normalizer.py
new file mode 100644
index 0000000..9d873f3
--- /dev/null
+++ b/tests/checkers/_factories_stub_normalizer.py
@@ -0,0 +1,63 @@
+"""Parametrize rows for ``AnnotationNormalizer`` tests.
+
+Split by checker domain out of the former 1393-line ``_factories.py`` (pylint
+C0302). Paired with ``tests/checkers/test_stub_normalizer.py``.
+"""
+
+from __future__ import annotations
+
+from typing import TYPE_CHECKING
+
+import pytest
+
+if TYPE_CHECKING:
+    from _pytest.mark.structures import ParameterSet
+
+_p = pytest.param
+
+
+# ── stub normalizer ──
+
+_NORMALIZER_INFER_CASES: list[ParameterSet] = [
+    _p("x: str", "str", id="infer_simple_name"),
+    _p("x: list[int]", "list[int]", id="infer_builtin_list"),
+    _p("x: str | None", "str | None", id="infer_native_union"),
+    _p("x: 'SomeFutureType'", None, id="infer_uninferable_returns_non_null"),
+]
+
+
+# ── AnnotationNormalizer._apply_rewrites ──
+
+_APPLY_REWRITES_CASES: list[ParameterSet] = [
+    _p("typing.List[str]", "list[str]", id="rewrite_typing_list"),
+    _p("typing.Dict[str, int]", "dict[str, int]", id="rewrite_typing_dict"),
+    _p("typing.Optional[str]", "str | None", id="rewrite_typing_optional"),
+    _p("typing.Union[str, int]", "str | int", id="rewrite_typing_union"),
+    _p(
+        "typing.Union[list[str], int]",
+        "list[str] | int",
+        id="rewrite_typing_union_nested_generic",
+    ),
+    _p(
+        "collections.abc.Callable",
+        "collections.abc.Callable",
+        id="rewrite_no_match_passes_through",
+    ),
+]
+
+_SPLIT_OUTER_COMMAS_CASES: list[ParameterSet] = [
+    _p("str, int, float", ["str", "int", "float"], id="simple"),
+    _p("list[str], int", ["list[str]", "int"], id="with_brackets"),
+]
+
+
+# ── AnnotationNormalizer._ast_string ──
+
+_AST_STRING_CASES: list[ParameterSet] = [
+    _p("x: list[str]", ["list"], "contains", id="subscript"),
+    _p("x: int | str", ["int | str"], "equals", id="binary_op_union"),
+    _p("x: typing.Optional[str]", ["typing.Optional"], "contains", id="attribute"),
+    _p("x: tuple[int, str]", None, "not_none", id="tuple"),
+    _p("x: Literal['hello']", ["hello"], "contains", id="const"),
+    _p("x: dict[str, list[int]]", ["dict", "list"], "contains", id="nested_subscript"),
+]
diff --git a/tests/checkers/test_beartype_checker.py b/tests/checkers/test_beartype_checker.py
index a2930f7..4f0c319 100644
--- a/tests/checkers/test_beartype_checker.py
+++ b/tests/checkers/test_beartype_checker.py
@@ -1,8 +1,8 @@
 """Unit tests for python_setup_lint.checkers.beartype_checker.
 
 Uses synthetic code strings parsed via astroid, walked over
-``BeartypeCoverageChecker``.  Fixture src / file-path rows live in
-``tests/checkers/_factories.py`` (free LOC, not counted against the gate).
+``BeartypeCoverageChecker``. Parametrize rows (src strings, file paths)
+live in ``tests/checkers/_factories_beartype.py``.
 """
 
 from __future__ import annotations
@@ -15,7 +15,7 @@ from pylint.testutils import CheckerTestCase
 
 from python_setup_lint.checkers.conformance.beartype_checker import BeartypeCoverageChecker
 from python_setup_lint.testing import _make_tc as _make_tc_factory
-from tests.checkers._factories import (
+from tests.checkers._factories_beartype import (
     _BEARTYPE_MISS_CASES,
     _BEARTYPE_SKIP_CASES,
     _BEARTYPE_SOURCE_ROOT_CASES,
diff --git a/tests/checkers/test_no_try_import_checker.py b/tests/checkers/test_no_try_import_checker.py
index dbe74d7..1adfef9 100644
--- a/tests/checkers/test_no_try_import_checker.py
+++ b/tests/checkers/test_no_try_import_checker.py
@@ -1,8 +1,8 @@
 """Unit tests for python_setup_lint.checkers.no_try_import_checker.
 
 Verifies the AST checker detects (and does not detect) the correct
-try/except+import patterns. All fixture src strings live in
-``tests/checkers/_factories.py`` (free LOC, not counted against the gate).
+try/except+import patterns. Parametrize rows (src strings) live in
+``tests/checkers/_factories_no_try_import.py``.
 """
 
 from __future__ import annotations
@@ -15,7 +15,7 @@ from python_setup_lint.checkers.conformance.no_try_import_checker import (
     NoTryImportChecker,
 )
 from python_setup_lint.testing import _walk_and_release
-from tests.checkers._factories import (
+from tests.checkers._factories_no_try_import import (
     _NO_TRY_DETECT_CASES,
     _NO_TRY_DO_NOT_DETECT_CASES,
 )
diff --git a/tests/checkers/test_stub_checker.py b/tests/checkers/test_stub_checker.py
index 2e73e18..f7a834a 100644
--- a/tests/checkers/test_stub_checker.py
+++ b/tests/checkers/test_stub_checker.py
@@ -5,7 +5,7 @@ Invariant 3 (variable fidelity). Includes T1-pyi-exemption behavior
 preservation tests (init/main/conftest/trivial-data early returns —
 proven invariants per ``/memories/repo/T1-pyi-exemptions.md``).
 
-Fixture-row data lives in ``tests/checkers/_factories.py`` (free LOC).
+Parametrize rows live in ``tests/checkers/_factories_stub.py``.
 """
 
 from __future__ import annotations
@@ -53,7 +53,7 @@ from python_setup_lint.checkers.stub.normalizer import (  # pylint: disable=wron
 from python_setup_lint.testing import (  # pylint: disable=wrong-import-position  # conditional import after module-level check
     _make_tc as _make_tc_factory,
 )
-from tests.checkers._factories import (  # pylint: disable=wrong-import-position  # conditional import after module-level check
+from tests.checkers._factories_stub import (  # pylint: disable=wrong-import-position  # conditional import after module-level check
     _IMPORT_CONTRACT_CASES,
     _IMPORT_USAGE_FIELD_CASES,
     _IN_TYPE_CHECKING_BLOCK_NEGATIVE_CASES,
@@ -366,7 +366,7 @@ def test_emit_import_contract_violations(  # pylint: disable=too-many-positional
     expected_msg_id: str | None,
     expected_count: int,
 ) -> None:
-    from tests.checkers._factories import setup_and_emit_import_contract
+    from tests.checkers._factories_stub import setup_and_emit_import_contract
 
     _tc, msgs = setup_and_emit_import_contract(
         target_module=target_module,
@@ -389,7 +389,7 @@ def test_emit_import_contract_violations(  # pylint: disable=too-many-positional
 
 @pytest.mark.parametrize(("star_policy", "expected_e97a3_count"), _STAR_POLICY_CASES)
 def test_star_import_policy_given_policy_then_expected_count(star_policy: str, expected_e97a3_count: int) -> None:
-    from tests.checkers._factories import (
+    from tests.checkers._factories_stub import (
         _build_star_import_policy_state,
         _star_usage_factory,
     )
diff --git a/tests/checkers/test_stub_checker_callable.py b/tests/checkers/test_stub_checker_callable.py
index 80dd9f2..577761f 100644
--- a/tests/checkers/test_stub_checker_callable.py
+++ b/tests/checkers/test_stub_checker_callable.py
@@ -3,7 +3,7 @@
 Tests parameter descriptor extraction, callable comparison, and end-to-end
 pylint runs for signature mismatch detection.
 
-Fixture-row data lives in ``tests/checkers/_factories.py`` (free LOC).
+Parametrize rows live in ``tests/checkers/_factories_stub_callable.py``.
 """
 
 from __future__ import annotations
@@ -23,7 +23,8 @@ from python_setup_lint.checkers.stub.fidelity import (  # type: ignore[attr-defi
     _compare_return_annotations,
     _extract_param_descriptors,
 )
-from tests.checkers._factories import (
+from tests.checkers._factories import _run_pylint
+from tests.checkers._factories_stub_callable import (
     _CALLABLE_FIDELITY_INTEGRATION_CASES,
     _COMPARE_ANNOTATION_CASES,
     _COMPARE_DESCRIPTOR_CASES,
@@ -32,7 +33,6 @@ from tests.checkers._factories import (
     _EXTRACT_DEFAULT_CASES,
     _EXTRACT_PARAM_CASES,
     _EXTRACT_STRIP_SELF_CASES,
-    _run_pylint,
 )
 
 pytestmark = pytest.mark.no_external_api
diff --git a/tests/checkers/test_stub_checker_class.py b/tests/checkers/test_stub_checker_class.py
index fba07ae..16c948d 100644
--- a/tests/checkers/test_stub_checker_class.py
+++ b/tests/checkers/test_stub_checker_class.py
@@ -4,7 +4,7 @@ Tests class base comparison, public method delegation, class attribute
 comparison, ClassVar skip in class bodies, E97B1 (stub symbol missing from
 impl), and E97B2 (kind mismatch).
 
-Fixture-row data lives in ``tests/checkers/_factories.py`` (free LOC).
+Parametrize rows live in ``tests/checkers/_factories_stub_class.py``.
 """
 
 from __future__ import annotations
@@ -22,13 +22,13 @@ from python_setup_lint.checkers.stub.fidelity import (  # type: ignore[attr-defi
     _normalize_bases,
 )
 from python_setup_lint.testing import _make_tc as _make_tc_factory
-from tests.checkers._factories import (
+from tests.checkers._factories import _run_pylint
+from tests.checkers._factories_stub_class import (
     _CLASS_FIDELITY_INTEGRATION_CASES,
     _IS_PUBLIC_METHOD_CASES,
     _KIND_MISMATCH_CASES,
     _NORMALIZE_BASES_CASES,
     _STUB_SYMBOL_MISSING_CASES,
-    _run_pylint,
     walk_stub_checker_with_pair,
 )
 
diff --git a/tests/checkers/test_stub_coverage.py b/tests/checkers/test_stub_coverage.py
index 40ad4ce..6c8703a 100644
--- a/tests/checkers/test_stub_coverage.py
+++ b/tests/checkers/test_stub_coverage.py
@@ -5,7 +5,7 @@ Exercises the private helpers directly (private-complex-unit category):
 ``_is_trivial_test_data``, ``_has_main_block``, ``_is_under_source_root``,
 ``_resolve_stub``, ``_index_stub_declarations``, ``emit_coverage_violations``.
 
-Fixture-row data lives in ``tests/checkers/_factories.py`` (free LOC).
+Parametrize rows live in ``tests/checkers/_factories_stub_coverage.py``.
 """
 
 from __future__ import annotations
@@ -28,7 +28,7 @@ from python_setup_lint.checkers.stub.coverage import (  # type: ignore[attr-defi
     _resolve_stub,
     emit_coverage_violations,
 )
-from tests.checkers._factories import (
+from tests.checkers._factories_stub_coverage import (
     _EMIT_COVERAGE_CASES,
     _HAS_MAIN_BLOCK_CASES,
     _IS_INIT_EXEMPT_CASES,
diff --git a/tests/checkers/test_stub_docstring_checker.py b/tests/checkers/test_stub_docstring_checker.py
index ccdd3aa..2d368fa 100644
--- a/tests/checkers/test_stub_docstring_checker.py
+++ b/tests/checkers/test_stub_docstring_checker.py
@@ -1,7 +1,7 @@
 """Unit tests for python_setup_lint.checkers.stub_docstring_checker.
 
 Tests docstring detection logic and full pipeline with stub_checker.
-Fixture src rows live in ``tests/checkers/_factories.py`` (free LOC).
+Parametrize rows (src strings) live in ``tests/checkers/_factories_stub_docstring.py``.
 """
 
 from __future__ import annotations
@@ -14,7 +14,7 @@ import pytest
 
 from python_setup_lint.checkers.stub.docstring_checker import StubDocstringChecker
 from python_setup_lint.testing import _make_tc as _make_tc_factory
-from tests.checkers._factories import (
+from tests.checkers._factories_stub_docstring import (
     _DOCSTRING_DETECT_CASES,
     _DOCSTRING_DOES_NOT_DETECT_CASES,
     _DOCSTRING_NO_COMPANION_CASES,
diff --git a/tests/checkers/test_stub_normalizer.py b/tests/checkers/test_stub_normalizer.py
index 792c1d2..163d005 100644
--- a/tests/checkers/test_stub_normalizer.py
+++ b/tests/checkers/test_stub_normalizer.py
@@ -12,7 +12,7 @@ import astroid
 import pytest
 
 from python_setup_lint.checkers.stub.normalizer import AnnotationNormalizer
-from tests.checkers._factories import (
+from tests.checkers._factories_stub_normalizer import (
     _APPLY_REWRITES_CASES,
     _AST_STRING_CASES,
     _NORMALIZER_INFER_CASES,

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
