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
  "slug": "runner-compat-shim-removal",
  "kind": "no-behavior",
  "title": "Remove runner compat shims",
  "assignment": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
  "outlineRef": "runner-compat-shim-removal",
  "milestone": "M3",
  "wave": 2,
  "deps": [
    "baseline-diff-merge"
  ],
  "scenarioRefs": [
    "M3: Runner split without drift"
  ],
  "citations": [
    "CodingRules.md:90-107"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..28670fb
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,207 @@
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
+        durationMs: 538
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 109873
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.6s]
+          ============================================================
+          Configuration
+          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
+          ✅ All modules validated!
+
+          ============================================================
+          [ruff check] PASSED [0.1s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [rumdl check] PASSED [0.1s]
+          ============================================================
+
+          Success: No issues found in 29 files (39ms)
+
+          ============================================================
+          [mypy] PASSED [11.4s]
+          ============================================================
+          Success: no issues found in 56 source files
+
+          ============================================================
+          [yamllint] PASSED [0.4s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.4s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [15.4s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [6.6s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794190366239",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 6.029
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.6s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [16.7s]
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
+          [pylint-pyi] PASSED [17.8s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [26.3s]
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
+          [detect-secrets] PASSED [11.6s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 44271
+        details: |-
+          [Tach] 1363 tests in 59 files unaffected by changes (~42.1s could be saved). Skip with: pytest --tach
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
+          ........................................................................ [ 91%]
+          ........................................................................ [ 96%]
+          .................................................                        [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1341 passed, 4 skipped, 18 deselected, 4 warnings in 41.19s
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
+        durationMs: 103179
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 15s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 101.52s (0:01:41)
+  - id: size
+    status: pass
+    message: "size passed: 67/300 production lines changed"
+    details:
+      changedLines:
+        added: 13
+        deleted: 54
+        total: 67
+        files:
+          - src/python_setup_lint/runner/baseline.py
+          - src/python_setup_lint/runner/baseline.pyi
+          - src/python_setup_lint/runner/parsers.py
+      limit: 300
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..512184e
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,59 @@
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
+  "slug": "runner-compat-shim-removal",
+  "kind": "no-behavior",
+  "title": "Remove runner compat shims",
+  "assignment": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "runner-compat-shim-removal",
+  "milestone": "M3",
+  "wave": 2,
+  "deps": [
+    "baseline-diff-merge"
+  ],
+  "scenarioRefs": [
+    "M3: Runner split without drift"
+  ],
+  "citations": [
+    "CodingRules.md:90-107"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
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
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..fd57bd2
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T01:57:52.663Z
+session: 01a1be07-dbef-71d0-88ff-84a482e0252f
+endedAt: 2026-11-09T02:16:27.863Z
+usage:
+  inputTokens: 74502
+  outputTokens: 30014
+  costUsd: 0.037697
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-527Z_01a1be07-dbef-71d0-88ff-84a482e0252f
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..7752a4f
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,66 @@
+status: ok
+summary: "Removed runner compatibility shims within the assigned ownership
+  boundary. baseline.py/.pyi: deleted `_FALLBACK_TOOLS` and the
+  `_compare_sorted` re-export (now imported directly from `_baseline_helpers` by
+  tests); retained only `peek_fallback_tools` with an explicit debt note because
+  the forbidden `runner/__init__.py`/`.pyi` re-export is a live in-repo consumer
+  (dispatch-split owns it). parsers.py: deleted the stale aliased
+  `_parse_*_records` back-compat re-export block, keeping only plain internal
+  imports needed to build `_RECORD_PARSERS`; `Record` stays exported via
+  `__all__`. Updated merged baseline-diff tests to import `_compare_sorted` from
+  `_baseline_helpers` and all record parsers from `_record_parsers`, and deleted
+  the shim-asserting `TestPeekFallbackTools` class. All target tests, the full
+  unit suite, integration/golden, and the 14-tool lint gate pass."
+target:
+  command: uv run pytest tests/runner/test_baseline_diff.py
+    tests/runner/test_baseline_diff_parsers.py -q
+  customTarget: true
+evidence:
+  - "`uv run pytest tests/runner/test_baseline_diff.py
+    tests/runner/test_baseline_diff_parsers.py -q` -> 72 passed, 2 deselected
+    (slow)."
+  - "`uv run pytest tests/runner/test_baseline_diff.py -q -m slow` -> 2 passed,
+    29 deselected (perf benchmarks using the new
+    `_baseline_helpers._compare_sorted` import)."
+  - "`uv run pytest -q` (final tree) -> 1341 passed, 4 skipped, 18 deselected, 0
+    failures."
+  - "`uv run pytest tests/integration.py -v` -> 9 passed, including golden
+    `assert_matches_golden`/`assert_golden_byte_identical` limbs (golden
+    byte-identical, no shift)."
+  - "`uv run lint` -> EXIT=0; 14/14 tools PASSED (ruff, rumdl, mypy, yamllint,
+    ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi,
+    pylint tests, tach, detect-secrets)."
+  - "Shim grep after change: `_FALLBACK_TOOLS` zero matches; `_compare_sorted`
+    only in `src/python_setup_lint/runner/_baseline_helpers.py(.pyi)` and the
+    test's direct import; `peek_fallback_tools` retained only with consumer
+    evidence `src/python_setup_lint/runner/__init__.py:22,62`,
+    `src/python_setup_lint/runner/__init__.pyi:20,60`,
+    `src/python_setup_lint/checkers/conformance/trivial_wrapper_checker.py:33`
+    plus the debt note at `baseline.py:19-22`, `baseline.pyi:10-11`."
+  - "Runtime assertion script: `python_setup_lint.runner.baseline` has no
+    `_FALLBACK_TOOLS`/`_compare_sorted`; `peek_fallback_tools()` returns
+    `frozenset()`; `runner.parsers.__all__` does not expose
+    `_parse_ruff_records`."
+  - "`uv run ruff check --config config/ruff.toml --select I` on all touched
+    files -> All checks passed (import order fixed in
+    test_baseline_diff_parsers.py)."
+  - "`git diff --check` -> CLEAN; workspace contains only the 5 intended
+    modified files (+22/−78 lines) and no temp artifacts."
+concerns:
+  - "`peek_fallback_tools` is intentionally retained (with debt note) because
+    `runner/__init__.py`/`.pyi` still re-export it and those files are forbidden
+    to this item; it must be deleted by the dispatch-split item together with
+    the package-level export. `trivial_wrapper_checker.py:33` still allowlists
+    the name (checkers item owns that exemption)."
+  - Deleted `TestPeekFallbackTools` (the only test asserting the removed legacy
+    stub behavior); module test count drops by one, which is the intended
+    shim-test removal rather than a coverage regression.
+  - "`parsers.py` still binds the `_parse_*_records` names at runtime via plain
+    imports required to build `_RECORD_PARSERS`; the typed back-compat re-export
+    contract (explicit `as` aliases, stub declarations, `__all__`) is gone, and
+    the only in-repo consumers now import `_record_parsers` directly."
+notes: "No behavior changes: baseline diffing and parser dispatch use the same
+  underlying functions; only import surfaces changed. `@beartype` was preserved
+  on the retained `peek_fallback_tools` because the project's pylint-pyi W9701
+  rule requires it. Assignment scope respected: no edits to dispatch*,
+  `__init__*`, types.py/cli threading, tests/data, or lint.baseline."
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..2f26678
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/checks.yaml
@@ -0,0 +1,162 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (2 test files, 3047 bytes)
+    details:
+      diff: "diff --git a/tests/runner/test_baseline_diff.py
+        b/tests/runner/test_baseline_diff.py
+
+        index b7b1143..6598594 100644
+
+        --- a/tests/runner/test_baseline_diff.py
+
+        +++ b/tests/runner/test_baseline_diff.py
+
+        @@ -9,12 +9,10 @@ from typing import Any
+
+        \\ 
+
+        \ import pytest
+
+        \\ 
+
+        -from python_setup_lint.runner import Record, peek_fallback_tools
+
+        +from python_setup_lint.runner import Record
+
+        +from python_setup_lint.runner._baseline_helpers import
+        _compare_sorted  # private import for white-box testing
+
+        \ from python_setup_lint.runner._record_types import
+        _compare_records_key
+
+        -from python_setup_lint.runner.baseline import (  # private import for
+        white-box testing
+
+        -    _compare_sorted,
+
+        -    _diff_baseline,
+
+        -)
+
+        +from python_setup_lint.runner.baseline import _diff_baseline  # private
+        import for white-box testing
+
+        \ from python_setup_lint.testing import make_lint_result
+
+        \ from tests.runner._factories import diff_baseline_with
+
+        \\ 
+
+        @@ -440,20 +438,7 @@ class TestDiffBaselineErrors:
+
+        \         assert check(violations, reloaded)
+
+        \\ 
+
+        \\ 
+
+        -# ── Fallback/frozen-stub and dedup pinning limbs ────────────────
+
+        -
+
+        -
+
+        -class TestPeekFallbackTools:
+
+        -    def test_peek_fallback_tools_given_snapshot_then_frozen_copy(self,
+        tmp_path: Path) -> None:
+
+        -        # peek_fallback_tools() now always returns empty frozenset
+        (WS-6 clean break).
+
+        -        # Verify diff_baseline_with doesn't crash and the stub returns
+        frozenset().
+
+        -        saved: list[dict[str, object]] = []
+
+        -        current = [make_lint_result(tool_name=\"ruff check\",
+        stdout=\"src/a.py:1:3: E501 msg\\n\")]
+
+        -        violations, _ = diff_baseline_with(tmp_path, saved, current)
+
+        -        assert any(\"msg @ src/a.py:1:3\" in x for x in violations)
+
+        -        snap = peek_fallback_tools()
+
+        -        assert isinstance(snap, frozenset)
+
+        -        assert snap == frozenset()
+
+        +# ── Flat-record round-trip and dedup pinning limbs ──────────────
+
+        \\ 
+
+        \\ 
+
+        \ class TestFlatRecordRoundTrip:
+
+        diff --git a/tests/runner/test_baseline_diff_parsers.py
+        b/tests/runner/test_baseline_diff_parsers.py
+
+        index 0160772..4bd870b 100644
+
+        --- a/tests/runner/test_baseline_diff_parsers.py
+
+        +++ b/tests/runner/test_baseline_diff_parsers.py
+
+        @@ -9,11 +9,7 @@ from typing import Any
+
+        \ import pytest
+
+        \\ 
+
+        \ from python_setup_lint.runner import Record
+
+        -from python_setup_lint.runner.baseline import (  # private import for
+        white-box testing
+
+        -    _capture_baseline,
+
+        -    _diff_baseline,
+
+        -)
+
+        -from python_setup_lint.runner.parsers import (  # type:
+        ignore[attr-defined]  # private import for white-box testing
+
+        +from python_setup_lint.runner._record_parsers import (  # private
+        import for white-box testing
+
+        \     _parse_mypy_records,
+
+        \     _parse_pylint_records,
+
+        \     _parse_pyright_records,
+
+        @@ -22,6 +18,10 @@ from python_setup_lint.runner.parsers import (  #
+        type: ignore[attr-defined]  #
+
+        \     _parse_ty_records,
+
+        \     _parse_yamllint_records,
+
+        \ )
+
+        +from python_setup_lint.runner.baseline import (  # private import for
+        white-box testing
+
+        +    _capture_baseline,
+
+        +    _diff_baseline,
+
+        +)
+
+        \ from python_setup_lint.testing import make_lint_result
+
+        \ from tests.runner._factories import diff_baseline_with
+
+        \ "
+      files:
+        - tests/runner/test_baseline_diff.py
+        - tests/runner/test_baseline_diff_parsers.py
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/input.md b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/input.md
new file mode 100644
index 0000000..66ef745
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/input.md
@@ -0,0 +1,636 @@
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
+  "slug": "runner-compat-shim-removal",
+  "kind": "no-behavior",
+  "title": "Remove runner compat shims",
+  "assignment": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "runner-compat-shim-removal",
+  "milestone": "M3",
+  "wave": 2,
+  "deps": [
+    "baseline-diff-merge"
+  ],
+  "scenarioRefs": [
+    "M3: Runner split without drift"
+  ],
+  "citations": [
+    "CodingRules.md:90-107"
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
+diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..28670fb
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,207 @@
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
++        durationMs: 538
++        details: 181 files already formatted
++      - id: lint
++        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
++          check,mypy.stubtest,pyright check,pyright verify
++          types,pylint,pylint-pyi,pylint tests,detect-secrets'
++        status: pass
++        durationMs: 109873
++        details: |-
++          ============================================================
++          [tach check] PASSED [0.6s]
++          ============================================================
++          Configuration
++          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
++          ✅ All modules validated!
++
++          ============================================================
++          [ruff check] PASSED [0.1s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [rumdl check] PASSED [0.1s]
++          ============================================================
++
++          Success: No issues found in 29 files (39ms)
++
++          ============================================================
++          [mypy] PASSED [11.4s]
++          ============================================================
++          Success: no issues found in 56 source files
++
++          ============================================================
++          [yamllint] PASSED [0.4s]
++          ============================================================
++
++          ============================================================
++          [ty check] PASSED [0.4s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [mypy.stubtest] PASSED [15.4s]
++          ============================================================
++
++          ============================================================
++          [pyright check] PASSED [6.6s]
++          ============================================================
++          {
++              "version": "1.1.410",
++              "time": "1794190366239",
++              "generalDiagnostics": [],
++              "summary": {
++                  "filesAnalyzed": 110,
++                  "errorCount": 0,
++                  "warningCount": 0,
++                  "informationCount": 0,
++                  "timeInSec": 6.029
++              }
++          }
++
++
++          ============================================================
++          [pyright verify types] PASSED [1.6s]
++          ============================================================
++            pyright verify types: completenessScore=1
++
++          ============================================================
++          [pylint] PASSED [16.7s]
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
++          [pylint-pyi] PASSED [17.8s]
++          ============================================================
++
++          --------------------------------------------------------------------
++          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
++
++
++          ============================================================
++          [pylint tests] PASSED [26.3s]
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
++          [detect-secrets] PASSED [11.6s]
++          ============================================================
++
++          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/config/.pylintrc
++      - id: test
++        command: uv run pytest -q
++        status: pass
++        durationMs: 44271
++        details: |-
++          [Tach] 1363 tests in 59 files unaffected by changes (~42.1s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          ........................................................................ [  5%]
++          ........................................................................ [ 10%]
++          .......................ssss............................................. [ 16%]
++          ........................................................................ [ 21%]
++          ........................................................................ [ 26%]
++          ........................................................................ [ 32%]
++          ........................................................................ [ 37%]
++          ........................................................................ [ 42%]
++          ........................................................................ [ 48%]
++          ........................................................................ [ 53%]
++          ........................................................................ [ 58%]
++          ........................................................................ [ 64%]
++          ........................................................................ [ 69%]
++          ........................................................................ [ 74%]
++          ........................................................................ [ 80%]
++          ........................................................................ [ 85%]
++          ........................................................................ [ 91%]
++          ........................................................................ [ 96%]
++          .................................................                        [100%]
++          =============================== warnings summary ===============================
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
++          1341 passed, 4 skipped, 18 deselected, 4 warnings in 41.19s
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
++        durationMs: 103179
++        details: |-
++          [Tach] 9 tests in 4 files unaffected by changes (~1m 15s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          .........                                                                [100%]
++          9 passed in 101.52s (0:01:41)
++  - id: size
++    status: pass
++    message: "size passed: 67/300 production lines changed"
++    details:
++      changedLines:
++        added: 13
++        deleted: 54
++        total: 67
++        files:
++          - src/python_setup_lint/runner/baseline.py
++          - src/python_setup_lint/runner/baseline.pyi
++          - src/python_setup_lint/runner/parsers.py
++      limit: 300
+diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..512184e
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,59 @@
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
++  "slug": "runner-compat-shim-removal",
++  "kind": "no-behavior",
++  "title": "Remove runner compat shims",
++  "assignment": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
++  "outlineRef": "runner-compat-shim-removal",
++  "milestone": "M3",
++  "wave": 2,
++  "deps": [
++    "baseline-diff-merge"
++  ],
++  "scenarioRefs": [
++    "M3: Runner split without drift"
++  ],
++  "citations": [
++    "CodingRules.md:90-107"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "CodingRules.md:90-107"
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
+diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..fd57bd2
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/meta.yaml
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
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-09T01:57:52.663Z
++session: 01a1be07-dbef-71d0-88ff-84a482e0252f
++endedAt: 2026-11-09T02:16:27.863Z
++usage:
++  inputTokens: 74502
++  outputTokens: 30014
++  costUsd: 0.037697
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-527Z_01a1be07-dbef-71d0-88ff-84a482e0252f
+diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..7752a4f
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,66 @@
++status: ok
++summary: "Removed runner compatibility shims within the assigned ownership
++  boundary. baseline.py/.pyi: deleted `_FALLBACK_TOOLS` and the
++  `_compare_sorted` re-export (now imported directly from `_baseline_helpers` by
++  tests); retained only `peek_fallback_tools` with an explicit debt note because
++  the forbidden `runner/__init__.py`/`.pyi` re-export is a live in-repo consumer
++  (dispatch-split owns it). parsers.py: deleted the stale aliased
++  `_parse_*_records` back-compat re-export block, keeping only plain internal
++  imports needed to build `_RECORD_PARSERS`; `Record` stays exported via
++  `__all__`. Updated merged baseline-diff tests to import `_compare_sorted` from
++  `_baseline_helpers` and all record parsers from `_record_parsers`, and deleted
++  the shim-asserting `TestPeekFallbackTools` class. All target tests, the full
++  unit suite, integration/golden, and the 14-tool lint gate pass."
++target:
++  command: uv run pytest tests/runner/test_baseline_diff.py
++    tests/runner/test_baseline_diff_parsers.py -q
++  customTarget: true
++evidence:
++  - "`uv run pytest tests/runner/test_baseline_diff.py
++    tests/runner/test_baseline_diff_parsers.py -q` -> 72 passed, 2 deselected
++    (slow)."
++  - "`uv run pytest tests/runner/test_baseline_diff.py -q -m slow` -> 2 passed,
++    29 deselected (perf benchmarks using the new
++    `_baseline_helpers._compare_sorted` import)."
++  - "`uv run pytest -q` (final tree) -> 1341 passed, 4 skipped, 18 deselected, 0
++    failures."
++  - "`uv run pytest tests/integration.py -v` -> 9 passed, including golden
++    `assert_matches_golden`/`assert_golden_byte_identical` limbs (golden
++    byte-identical, no shift)."
++  - "`uv run lint` -> EXIT=0; 14/14 tools PASSED (ruff, rumdl, mypy, yamllint,
++    ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi,
++    pylint tests, tach, detect-secrets)."
++  - "Shim grep after change: `_FALLBACK_TOOLS` zero matches; `_compare_sorted`
++    only in `src/python_setup_lint/runner/_baseline_helpers.py(.pyi)` and the
++    test's direct import; `peek_fallback_tools` retained only with consumer
++    evidence `src/python_setup_lint/runner/__init__.py:22,62`,
++    `src/python_setup_lint/runner/__init__.pyi:20,60`,
++    `src/python_setup_lint/checkers/conformance/trivial_wrapper_checker.py:33`
++    plus the debt note at `baseline.py:19-22`, `baseline.pyi:10-11`."
++  - "Runtime assertion script: `python_setup_lint.runner.baseline` has no
++    `_FALLBACK_TOOLS`/`_compare_sorted`; `peek_fallback_tools()` returns
++    `frozenset()`; `runner.parsers.__all__` does not expose
++    `_parse_ruff_records`."
++  - "`uv run ruff check --config config/ruff.toml --select I` on all touched
++    files -> All checks passed (import order fixed in
++    test_baseline_diff_parsers.py)."
++  - "`git diff --check` -> CLEAN; workspace contains only the 5 intended
++    modified files (+22/−78 lines) and no temp artifacts."
++concerns:
++  - "`peek_fallback_tools` is intentionally retained (with debt note) because
++    `runner/__init__.py`/`.pyi` still re-export it and those files are forbidden
++    to this item; it must be deleted by the dispatch-split item together with
++    the package-level export. `trivial_wrapper_checker.py:33` still allowlists
++    the name (checkers item owns that exemption)."
++  - Deleted `TestPeekFallbackTools` (the only test asserting the removed legacy
++    stub behavior); module test count drops by one, which is the intended
++    shim-test removal rather than a coverage regression.
++  - "`parsers.py` still binds the `_parse_*_records` names at runtime via plain
++    imports required to build `_RECORD_PARSERS`; the typed back-compat re-export
++    contract (explicit `as` aliases, stub declarations, `__all__`) is gone, and
++    the only in-repo consumers now import `_record_parsers` directly."
++notes: "No behavior changes: baseline diffing and parser dispatch use the same
++  underlying functions; only import surfaces changed. `@beartype` was preserved
++  on the retained `peek_fallback_tools` because the project's pylint-pyi W9701
++  rule requires it. Assignment scope respected: no edits to dispatch*,
++  `__init__*`, types.py/cli threading, tests/data, or lint.baseline."
+diff --git a/src/python_setup_lint/runner/baseline.py b/src/python_setup_lint/runner/baseline.py
+index a1094ef..803d1ce 100644
+--- a/src/python_setup_lint/runner/baseline.py
++++ b/src/python_setup_lint/runner/baseline.py
+@@ -10,17 +10,16 @@ from pathlib import Path
+ 
+ import beartype
+ 
+-from ._record_types import Record
+ from .parsers import _RECORD_PARSERS
+ from .types import LintResult
+ 
+ __all__ = ["_capture_baseline", "_diff_baseline"]
+ 
+ 
+-# ── Backward-compat exports (legacy stubs for external consumers) ──
+-
+-
+-_FALLBACK_TOOLS: set[str] = set()
++# ── Retained package-export shim (debt: owned by dispatch-split) ──
++# ``runner/__init__.py`` and its stub still re-export ``peek_fallback_tools``;
++# this trivial stub keeps that forbidden-to-edit consumer importable and is
++# deleted together with the package-level export.
+ 
+ 
+ @beartype.beartype
+@@ -28,20 +27,6 @@ def peek_fallback_tools() -> frozenset[str]:
+     return frozenset()
+ 
+ 
+-def _compare_sorted(a: list[Record], b: list[Record]) -> tuple[list[Record], list[Record]]:
+-    """Re-export of :func:`_baseline_helpers._compare_sorted` for backwards compat.
+-
+-    The new violations-only baseline uses a direct violation-list diff instead,
+-    but test code imported this from baseline before the refactor.
+-
+-    Returns:
+-        A tuple ``(added, removed)`` of :class:`Record` lists.
+-    """
+-    from ._baseline_helpers import _compare_sorted as _cs
+-
+-    return _cs(a, b)
+-
+-
+ # ── Core helpers ──────────────────────────────────────────────────
+ 
+ 
+diff --git a/src/python_setup_lint/runner/baseline.pyi b/src/python_setup_lint/runner/baseline.pyi
+index ca5b55f..c8fc44c 100644
+--- a/src/python_setup_lint/runner/baseline.pyi
++++ b/src/python_setup_lint/runner/baseline.pyi
+@@ -5,21 +5,10 @@ Violations-only baseline: flat records sorted by (tool, file, line, col).
+ 
+ from pathlib import Path
+ 
+-from .parsers import Record
+ from .types import LintResult
+ 
+-_FALLBACK_TOOLS: set[str]
+-"""Legacy stub: always empty. The new format has no fallback path."""
+-
+ def peek_fallback_tools() -> frozenset[str]:
+-    """Legacy stub: returns empty frozenset."""
+-
+-def _compare_sorted(a: list[Record], b: list[Record]) -> tuple[list[Record], list[Record]]:
+-    """Re-export of :func:`_baseline_helpers._compare_sorted` for backwards compat.
+-
+-    Returns:
+-        A tuple ``(added, removed)``.
+-    """
++    """Package-export shim, deleted with ``runner/__init__``'s re-export."""
+ 
+ def _capture_baseline(results: list[LintResult], *, cwd: Path | None = None) -> list[dict[str, object]]:
+     """All violations as a flat list sorted by (tool, file, line, col, rule).
+diff --git a/src/python_setup_lint/runner/parsers.py b/src/python_setup_lint/runner/parsers.py
+index 6d7b67d..82a62e0 100644
+--- a/src/python_setup_lint/runner/parsers.py
++++ b/src/python_setup_lint/runner/parsers.py
+@@ -4,31 +4,16 @@ import json
+ import re
+ from typing import TYPE_CHECKING, Any
+ 
+-from ._record_parsers import (  # re-exported for backward compat; pylint: disable=useless-import-alias  # as-alias needed for mypy strict re-export
+-    _parse_mypy_records as _parse_mypy_records,
+-)
+-from ._record_parsers import (
+-    _parse_pylint_records as _parse_pylint_records,
+-)
+-from ._record_parsers import (
+-    _parse_pyright_check_records as _parse_pyright_check_records,
+-)
+-from ._record_parsers import (
+-    _parse_pyright_records as _parse_pyright_records,
+-)
+-from ._record_parsers import (
+-    _parse_ruff_records as _parse_ruff_records,
+-)
+-from ._record_parsers import (
+-    _parse_rumdl_records as _parse_rumdl_records,
+-)
+-from ._record_parsers import (
+-    _parse_ty_records as _parse_ty_records,
+-)
+ from ._record_parsers import (
+-    _parse_yamllint_records as _parse_yamllint_records,
++    _parse_mypy_records,
++    _parse_pylint_records,
++    _parse_pyright_check_records,
++    _parse_ruff_records,
++    _parse_rumdl_records,
++    _parse_ty_records,
++    _parse_yamllint_records,
+ )
+-from ._record_types import Record  # re-exported for backward compat
++from ._record_types import Record  # re-exported via __all__ for the package surface
+ 
+ if TYPE_CHECKING:
+     from collections.abc import Callable
+diff --git a/tests/runner/test_baseline_diff.py b/tests/runner/test_baseline_diff.py
+index b7b1143..6598594 100644
+--- a/tests/runner/test_baseline_diff.py
++++ b/tests/runner/test_baseline_diff.py
+@@ -9,12 +9,10 @@ from typing import Any
+ 
+ import pytest
+ 
+-from python_setup_lint.runner import Record, peek_fallback_tools
++from python_setup_lint.runner import Record
++from python_setup_lint.runner._baseline_helpers import _compare_sorted  # private import for white-box testing
+ from python_setup_lint.runner._record_types import _compare_records_key
+-from python_setup_lint.runner.baseline import (  # private import for white-box testing
+-    _compare_sorted,
+-    _diff_baseline,
+-)
++from python_setup_lint.runner.baseline import _diff_baseline  # private import for white-box testing
+ from python_setup_lint.testing import make_lint_result
+ from tests.runner._factories import diff_baseline_with
+ 
+@@ -440,20 +438,7 @@ class TestDiffBaselineErrors:
+         assert check(violations, reloaded)
+ 
+ 
+-# ── Fallback/frozen-stub and dedup pinning limbs ────────────────
+-
+-
+-class TestPeekFallbackTools:
+-    def test_peek_fallback_tools_given_snapshot_then_frozen_copy(self, tmp_path: Path) -> None:
+-        # peek_fallback_tools() now always returns empty frozenset (WS-6 clean break).
+-        # Verify diff_baseline_with doesn't crash and the stub returns frozenset().
+-        saved: list[dict[str, object]] = []
+-        current = [make_lint_result(tool_name="ruff check", stdout="src/a.py:1:3: E501 msg\n")]
+-        violations, _ = diff_baseline_with(tmp_path, saved, current)
+-        assert any("msg @ src/a.py:1:3" in x for x in violations)
+-        snap = peek_fallback_tools()
+-        assert isinstance(snap, frozenset)
+-        assert snap == frozenset()
++# ── Flat-record round-trip and dedup pinning limbs ──────────────
+ 
+ 
+ class TestFlatRecordRoundTrip:
+diff --git a/tests/runner/test_baseline_diff_parsers.py b/tests/runner/test_baseline_diff_parsers.py
+index 0160772..4bd870b 100644
+--- a/tests/runner/test_baseline_diff_parsers.py
++++ b/tests/runner/test_baseline_diff_parsers.py
+@@ -9,11 +9,7 @@ from typing import Any
+ import pytest
+ 
+ from python_setup_lint.runner import Record
+-from python_setup_lint.runner.baseline import (  # private import for white-box testing
+-    _capture_baseline,
+-    _diff_baseline,
+-)
+-from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  # private import for white-box testing
++from python_setup_lint.runner._record_parsers import (  # private import for white-box testing
+     _parse_mypy_records,
+     _parse_pylint_records,
+     _parse_pyright_records,
+@@ -22,6 +18,10 @@ from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  #
+     _parse_ty_records,
+     _parse_yamllint_records,
+ )
++from python_setup_lint.runner.baseline import (  # private import for white-box testing
++    _capture_baseline,
++    _diff_baseline,
++)
+ from python_setup_lint.testing import make_lint_result
+ from tests.runner._factories import diff_baseline_with
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
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..32cae96
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/meta.yaml
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
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T02:27:10.540Z
+session: 01a1be21-8919-71be-8119-0c48e83efd6d
+endedAt: 2026-11-09T02:33:42.392Z
+usage:
+  inputTokens: 41931
+  outputTokens: 33172
+  costUsd: 0.011981
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-257Z_01a1be21-8919-71be-8119-0c48e83efd6d
diff --git a/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..59eeecf
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1/output.yaml
@@ -0,0 +1,3 @@
+status: approved
+summary: Shim removal in-scope, no weakening, all suites green
+suggestions: []
diff --git a/src/python_setup_lint/runner/baseline.py b/src/python_setup_lint/runner/baseline.py
index a1094ef..803d1ce 100644
--- a/src/python_setup_lint/runner/baseline.py
+++ b/src/python_setup_lint/runner/baseline.py
@@ -10,17 +10,16 @@ from pathlib import Path
 
 import beartype
 
-from ._record_types import Record
 from .parsers import _RECORD_PARSERS
 from .types import LintResult
 
 __all__ = ["_capture_baseline", "_diff_baseline"]
 
 
-# ── Backward-compat exports (legacy stubs for external consumers) ──
-
-
-_FALLBACK_TOOLS: set[str] = set()
+# ── Retained package-export shim (debt: owned by dispatch-split) ──
+# ``runner/__init__.py`` and its stub still re-export ``peek_fallback_tools``;
+# this trivial stub keeps that forbidden-to-edit consumer importable and is
+# deleted together with the package-level export.
 
 
 @beartype.beartype
@@ -28,20 +27,6 @@ def peek_fallback_tools() -> frozenset[str]:
     return frozenset()
 
 
-def _compare_sorted(a: list[Record], b: list[Record]) -> tuple[list[Record], list[Record]]:
-    """Re-export of :func:`_baseline_helpers._compare_sorted` for backwards compat.
-
-    The new violations-only baseline uses a direct violation-list diff instead,
-    but test code imported this from baseline before the refactor.
-
-    Returns:
-        A tuple ``(added, removed)`` of :class:`Record` lists.
-    """
-    from ._baseline_helpers import _compare_sorted as _cs
-
-    return _cs(a, b)
-
-
 # ── Core helpers ──────────────────────────────────────────────────
 
 
diff --git a/src/python_setup_lint/runner/baseline.pyi b/src/python_setup_lint/runner/baseline.pyi
index ca5b55f..c8fc44c 100644
--- a/src/python_setup_lint/runner/baseline.pyi
+++ b/src/python_setup_lint/runner/baseline.pyi
@@ -5,21 +5,10 @@ Violations-only baseline: flat records sorted by (tool, file, line, col).
 
 from pathlib import Path
 
-from .parsers import Record
 from .types import LintResult
 
-_FALLBACK_TOOLS: set[str]
-"""Legacy stub: always empty. The new format has no fallback path."""
-
 def peek_fallback_tools() -> frozenset[str]:
-    """Legacy stub: returns empty frozenset."""
-
-def _compare_sorted(a: list[Record], b: list[Record]) -> tuple[list[Record], list[Record]]:
-    """Re-export of :func:`_baseline_helpers._compare_sorted` for backwards compat.
-
-    Returns:
-        A tuple ``(added, removed)``.
-    """
+    """Package-export shim, deleted with ``runner/__init__``'s re-export."""
 
 def _capture_baseline(results: list[LintResult], *, cwd: Path | None = None) -> list[dict[str, object]]:
     """All violations as a flat list sorted by (tool, file, line, col, rule).
diff --git a/src/python_setup_lint/runner/parsers.py b/src/python_setup_lint/runner/parsers.py
index 6d7b67d..82a62e0 100644
--- a/src/python_setup_lint/runner/parsers.py
+++ b/src/python_setup_lint/runner/parsers.py
@@ -4,31 +4,16 @@ import json
 import re
 from typing import TYPE_CHECKING, Any
 
-from ._record_parsers import (  # re-exported for backward compat; pylint: disable=useless-import-alias  # as-alias needed for mypy strict re-export
-    _parse_mypy_records as _parse_mypy_records,
-)
-from ._record_parsers import (
-    _parse_pylint_records as _parse_pylint_records,
-)
-from ._record_parsers import (
-    _parse_pyright_check_records as _parse_pyright_check_records,
-)
-from ._record_parsers import (
-    _parse_pyright_records as _parse_pyright_records,
-)
-from ._record_parsers import (
-    _parse_ruff_records as _parse_ruff_records,
-)
-from ._record_parsers import (
-    _parse_rumdl_records as _parse_rumdl_records,
-)
-from ._record_parsers import (
-    _parse_ty_records as _parse_ty_records,
-)
 from ._record_parsers import (
-    _parse_yamllint_records as _parse_yamllint_records,
+    _parse_mypy_records,
+    _parse_pylint_records,
+    _parse_pyright_check_records,
+    _parse_ruff_records,
+    _parse_rumdl_records,
+    _parse_ty_records,
+    _parse_yamllint_records,
 )
-from ._record_types import Record  # re-exported for backward compat
+from ._record_types import Record  # re-exported via __all__ for the package surface
 
 if TYPE_CHECKING:
     from collections.abc import Callable
diff --git a/tests/runner/test_baseline_diff.py b/tests/runner/test_baseline_diff.py
index b7b1143..6598594 100644
--- a/tests/runner/test_baseline_diff.py
+++ b/tests/runner/test_baseline_diff.py
@@ -9,12 +9,10 @@ from typing import Any
 
 import pytest
 
-from python_setup_lint.runner import Record, peek_fallback_tools
+from python_setup_lint.runner import Record
+from python_setup_lint.runner._baseline_helpers import _compare_sorted  # private import for white-box testing
 from python_setup_lint.runner._record_types import _compare_records_key
-from python_setup_lint.runner.baseline import (  # private import for white-box testing
-    _compare_sorted,
-    _diff_baseline,
-)
+from python_setup_lint.runner.baseline import _diff_baseline  # private import for white-box testing
 from python_setup_lint.testing import make_lint_result
 from tests.runner._factories import diff_baseline_with
 
@@ -440,20 +438,7 @@ class TestDiffBaselineErrors:
         assert check(violations, reloaded)
 
 
-# ── Fallback/frozen-stub and dedup pinning limbs ────────────────
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
+# ── Flat-record round-trip and dedup pinning limbs ──────────────
 
 
 class TestFlatRecordRoundTrip:
diff --git a/tests/runner/test_baseline_diff_parsers.py b/tests/runner/test_baseline_diff_parsers.py
index 0160772..4bd870b 100644
--- a/tests/runner/test_baseline_diff_parsers.py
+++ b/tests/runner/test_baseline_diff_parsers.py
@@ -9,11 +9,7 @@ from typing import Any
 import pytest
 
 from python_setup_lint.runner import Record
-from python_setup_lint.runner.baseline import (  # private import for white-box testing
-    _capture_baseline,
-    _diff_baseline,
-)
-from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  # private import for white-box testing
+from python_setup_lint.runner._record_parsers import (  # private import for white-box testing
     _parse_mypy_records,
     _parse_pylint_records,
     _parse_pyright_records,
@@ -22,6 +18,10 @@ from python_setup_lint.runner.parsers import (  # type: ignore[attr-defined]  #
     _parse_ty_records,
     _parse_yamllint_records,
 )
+from python_setup_lint.runner.baseline import (  # private import for white-box testing
+    _capture_baseline,
+    _diff_baseline,
+)
 from python_setup_lint.testing import make_lint_result
 from tests.runner._factories import diff_baseline_with

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
