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
  "slug": "semantic-threshold-consolidation",
  "kind": "test-only",
  "title": "Consolidate semantic heuristic tables",
  "assignment": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "semantic-threshold-consolidation",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Threshold deduped plus guards pinned"
  ],
  "citations": [
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_check.py:159-257",
    "tests/checkers/test_semantic_threshold.py:19-25",
    "CodingRules.md:139-159",
    "CodingRules.md:230-306"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..aecc05d
--- /dev/null
+++ b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/checks.yaml
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
+        durationMs: 258
+        details: 182 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 83157
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
+          Success: No issues found in 29 files (21ms)
+
+          ============================================================
+          [mypy] PASSED [7.7s]
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
+          [mypy.stubtest] PASSED [9.8s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.2s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794185042463",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.698
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.3s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [13.2s]
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
+          [pylint-pyi] PASSED [13.0s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [22.8s]
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
+                  "modulesLinted": 76,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] PASSED [8.6s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--semantic-threshold-consolidation/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 41507
+        details: |-
+          [Tach] 1367 tests in 60 files unaffected by changes (~35.8s could be saved). Skip with: pytest --tach
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
+          .....................................................                    [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--semantic-threshold-consolidation/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--semantic-threshold-consolidation/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--semantic-threshold-consolidation/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1345 passed, 4 skipped, 18 deselected, 4 warnings in 39.11s
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
+        durationMs: 80074
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 23s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 78.91s (0:01:18)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (2 test files changed)
diff --git a/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..39dc5ef
--- /dev/null
+++ b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,64 @@
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
+  "slug": "semantic-threshold-consolidation",
+  "kind": "test-only",
+  "title": "Consolidate semantic heuristic tables",
+  "assignment": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
+  "outlineRef": "semantic-threshold-consolidation",
+  "milestone": "M2",
+  "wave": 1,
+  "scenarioRefs": [
+    "M2: Threshold deduped plus guards pinned"
+  ],
+  "citations": [
+    "tests/checkers/test_semantic_check.py:1-7",
+    "tests/checkers/test_semantic_check.py:159-257",
+    "tests/checkers/test_semantic_threshold.py:19-25",
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
+  "tests/checkers/test_semantic_check.py:1-7",
+  "tests/checkers/test_semantic_check.py:159-257",
+  "tests/checkers/test_semantic_threshold.py:19-25",
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
diff --git a/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..07c2a02
--- /dev/null
+++ b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
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
+startedAt: 2026-11-09T00:32:26.645Z
+session: 01a1bdb9-3cf7-77db-8083-cd6d29628eca
+endedAt: 2026-11-09T00:47:03.403Z
+usage:
+  inputTokens: 50073
+  outputTokens: 22521
+  costUsd: 0.023767
+repairedFrom: ask
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T00-33-16-023Z_01a1bdb9-3cf7-77db-8083-cd6d29628eca
diff --git a/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..431677e
--- /dev/null
+++ b/.factory/tasks/modernize/items/semantic-threshold-consolidation/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,54 @@
+status: ok
+summary: "Consolidated the semantic heuristic comment packs into one deduped
+  parametrized table in tests/checkers/test_semantic_threshold.py (115 unique
+  (comment, expected) rows; 33 meaningful + 50 meaningless + 35 brush-off at
+  HEAD, with 30 meaningful and 3 brush-off/meaningless overlaps). Each row pins
+  its expected heuristic outcome and parameter IDs remain the comment text.
+  Removed the moved TestBrushOffPatterns/TestMeaningfulPatterns classes and the
+  stale '# pylint: disable=too-many-lines  # 504 lines' header from
+  tests/checkers/test_semantic_check.py (now 401 lines, no module suppression),
+  leaving all reranker-specific classes untouched. The deduped table lives in
+  test_semantic_threshold.py so M4's reranker-class rewrite in
+  test_semantic_check.py cannot discard it."
+target:
+  command: uv run pytest tests/checkers/test_semantic_check.py
+    tests/checkers/test_semantic_threshold.py -q
+  customTarget: true
+evidence:
+  - "AST recount at HEAD: brush-off 35, meaningful 33, threshold meaningful 30,
+    meaningless 50; cross-pack overlaps exactly 30 meaningful + 3
+    (wip/tbd/temp), no intra-pack duplicates; union = 115 unique comments."
+  - "AST equivalence check: new _HEURISTIC_CASES has 115 unique rows whose
+    comment set equals the HEAD union; every pinned boolean matches the source
+    pack's expected outcome (True for meaningful packs, False for
+    meaningless/brush-off)."
+  - "pytest --collect-only on the threshold module: 115 collected test IDs, all
+    unique; IDs equal the comment text exactly (only pytest's pre-existing
+    \\u2014 display escaping for the em dash)."
+  - uv run pytest tests/checkers/test_semantic_check.py
+    tests/checkers/test_semantic_threshold.py -q -> 125 passed, 4 skipped, 3
+    deselected (158 -> 125 items as the 33 deduped duplicates collapsed, per
+    assignment).
+  - uv run pytest -q -> 1345 passed, 4 skipped, 18 deselected, exit 0 (re-run
+    after lint, still green).
+  - uv run lint -> exit 0; pylint tests PASSED (76 modules, score 10.00/10), all
+    14 tools PASSED.
+  - uv run pytest tests/integration.py -q -> 9 passed in 84.24s, including
+    assert_matches_golden and assert_golden_byte_identical (golden snapshot
+    hash-equal).
+  - "Module hygiene: test_semantic_check.py 401 lines,
+    test_semantic_threshold.py 164 lines; no pylint: disable header in either;
+    git diff touches only the two permitted test files."
+  - Reranker-specific classes (TestImportErrorFallback, TestDefaultUserFallback,
+    TestRerankerImportFallback, TestSemanticCheck, TestRerankerPairs) were left
+    byte-identical; only the two heuristic classes and stale header were
+    removed.
+concerns:
+  - Dedup intentionally reduces the two modules' selected test count from 158 to
+    125; this is the assignment's requested deduplication, not lost coverage
+    (all 115 unique comments remain, outcomes pinned).
+  - M4 must preserve the deduped table in test_semantic_threshold.py when
+    rewriting reranker classes in test_semantic_check.py.
+notes: Table grouped readably by meaningful / placeholder / boilerplate /
+  short-empty / brush-off sections; no runtime dedup logic, the literal table
+  itself is deduped.
diff --git a/tests/checkers/test_semantic_check.py b/tests/checkers/test_semantic_check.py
index 8ac01a4..5756341 100644
--- a/tests/checkers/test_semantic_check.py
+++ b/tests/checkers/test_semantic_check.py
@@ -1,4 +1,3 @@
-# pylint: disable=too-many-lines  # 504 lines — test module for semantic NLP pipeline; splitting would lose shared fixture context
 """Unit tests for python_setup_lint.checkers._semantic.
 
 Tests the single-stage NLP ``semantic_check_if_meaningful`` function.
@@ -153,110 +152,6 @@ class TestRerankerImportFallback:
         mock_import.assert_not_called()
 
 
-# ── Brush-off pattern detection (heuristic) ──────────────────────────
-
-
-class TestBrushOffPatterns:
-    """Each brush-off / deferral pattern must fail the heuristic check."""
-
-    @pytest.mark.parametrize(
-        "comment",
-        [
-            # Single-word brush-off patterns
-            "pre-existing",
-            "preexisting",
-            "baseline",
-            "base-line",
-            "wip",
-            "tbd",
-            "temp",
-            "temporary",
-            "existing",
-            "as-is",
-            "legacy",
-            "will fix",
-            "later",
-            "eventually",
-            "someday",
-            "placeholder",
-            "stub here",
-            "for now",
-            "to do",
-            "fixme later",
-            "carryover",
-            # Multi-word brush-off phrases
-            "pre existing",
-            "in baseline",
-            "was already",
-            "not my code",
-            "carry over",
-            "from before",
-            "carry from",
-            # Compound brush-off phrases
-            "pre-existing issue",
-            "baseline issue",
-            "todo later",
-            "existing issue",
-            "will fix later",
-            "fix later",
-            "preexisting issue",
-        ],
-    )
-    def test_brush_off_rejected(self, comment: str) -> None:
-        """A brush-off justification should fail the heuristic check."""
-        with patch.dict("os.environ", {"PYTHON_SETUP_LINT_SEMANTIC": "0"}):
-            result = check_if_meaningful(comment)
-        assert result is False, f"Expected False for brush-off: {comment!r}"
-
-
-class TestMeaningfulPatterns:
-    """Genuinely meaningful justifications must pass the heuristic check."""
-
-    @pytest.mark.parametrize(
-        "comment",
-        [
-            "circular import — PyLinter not available at runtime",
-            "type stub not yet generated for this module",
-            "third-party library has no type stubs available",
-            "conditional import guarded by TYPE_CHECKING",
-            "runtime attribute set by C extension, not visible to pylint",
-            "this module is generated by protobuf compiler",
-            "import is only used for type checking, not at runtime",
-            "function is overridden in subclass with different signature",
-            "variable assigned in except handler, not defined in all paths",
-            "nested function closure captures variable by reference",
-            "abstract method implemented in concrete subclass",
-            "property setter defined in parent class",
-            "metaclass conflict resolved at runtime",
-            "dynamic attribute set by __getattr__",
-            "module-level __all__ controls public API",
-            "re-export for backwards compatibility",
-            "alias for renamed external dependency",
-            "conditional import for Python version compatibility",
-            "platform-specific code path for Windows",
-            "mock object used in test fixture setup",
-            "fixture parameter injected by pytest",
-            "async generator needs manual cleanup in __aenter__",
-            "context manager wraps low-level resource handle",
-            "descriptor protocol implemented via __set_name__",
-            "singleton pattern uses __new__ override",
-            "dataclass field with default_factory",
-            "enum member with custom __init__ parameters",
-            "mixin class designed for cooperative multiple inheritance",
-            "abstract property defined in ABC base class",
-            "classmethod used as alternative constructor",
-            "carried from external library httpx for type compatibility",
-            "carried from library",
-            "external library carry",
-        ],
-    )
-    def test_meaningful_passes(self, comment: str) -> None:
-        """A genuinely meaningful justification should pass."""
-        with patch.dict("os.environ", {"PYTHON_SETUP_LINT_SEMANTIC": "0"}):
-            result = check_if_meaningful(comment)
-        assert result is True, f"Expected True for meaningful: {comment!r}"
-
-
 # ── Semantic pipeline (requires sentence_transformers) ───────────────
 
 
diff --git a/tests/checkers/test_semantic_threshold.py b/tests/checkers/test_semantic_threshold.py
index b3e21dd..a6f96c8 100644
--- a/tests/checkers/test_semantic_threshold.py
+++ b/tests/checkers/test_semantic_threshold.py
@@ -13,123 +13,152 @@ import pytest
 
 from python_setup_lint.checkers._base import check_if_meaningful
 
-# ── Threshold test: 50+ calls ────────────────────────────────────────
+# ── Single deduped heuristic table ───────────────────────────────────
+#
+# ``(comment, expected)`` pairs merged from the former per-file packs:
+# 33 meaningful + 50 meaningless + 35 brush-off comments, deduped to
+# 115 unique rows (30 meaningful and 3 meaningless entries overlapped).
+# Every outcome is pinned explicitly; parameter IDs stay the comment text.
+
+_HEURISTIC_CASES: tuple[tuple[str, bool], ...] = (
+    # ── Meaningful justifications (True) ─────────────────────────────
+    ("circular import — PyLinter not available at runtime", True),
+    ("type stub not yet generated for this module", True),
+    ("third-party library has no type stubs available", True),
+    ("conditional import guarded by TYPE_CHECKING", True),
+    ("runtime attribute set by C extension, not visible to pylint", True),
+    ("this module is generated by protobuf compiler", True),
+    ("import is only used for type checking, not at runtime", True),
+    ("function is overridden in subclass with different signature", True),
+    ("variable assigned in except handler, not defined in all paths", True),
+    ("nested function closure captures variable by reference", True),
+    ("abstract method implemented in concrete subclass", True),
+    ("property setter defined in parent class", True),
+    ("metaclass conflict resolved at runtime", True),
+    ("dynamic attribute set by __getattr__", True),
+    ("module-level __all__ controls public API", True),
+    ("re-export for backwards compatibility", True),
+    ("alias for renamed external dependency", True),
+    ("conditional import for Python version compatibility", True),
+    ("platform-specific code path for Windows", True),
+    ("mock object used in test fixture setup", True),
+    ("fixture parameter injected by pytest", True),
+    ("async generator needs manual cleanup in __aenter__", True),
+    ("context manager wraps low-level resource handle", True),
+    ("descriptor protocol implemented via __set_name__", True),
+    ("singleton pattern uses __new__ override", True),
+    ("dataclass field with default_factory", True),
+    ("enum member with custom __init__ parameters", True),
+    ("mixin class designed for cooperative multiple inheritance", True),
+    ("abstract property defined in ABC base class", True),
+    ("classmethod used as alternative constructor", True),
+    ("carried from external library httpx for type compatibility", True),
+    ("carried from library", True),
+    ("external library carry", True),
+    # ── Placeholder / vague single words (False) ─────────────────────
+    ("TODO", False),
+    ("fix this", False),
+    ("need to check", False),
+    ("maybe later", False),
+    ("not sure", False),
+    ("hmm", False),
+    ("???", False),
+    ("lol", False),
+    ("wtf", False),
+    ("nice", False),
+    ("good", False),
+    ("bad", False),
+    ("ok", False),
+    ("done", False),
+    ("fixed", False),
+    ("works", False),
+    ("broken", False),
+    ("test", False),
+    ("check", False),
+    ("update", False),
+    ("remove", False),
+    ("add", False),
+    ("change", False),
+    ("fix", False),
+    ("improve", False),
+    ("refactor", False),
+    # ── Boilerplate (False) ──────────────────────────────────────────
+    ("noqa", False),
+    ("ignore", False),
+    ("suppress", False),
+    ("disable", False),
+    ("skip", False),
+    ("todo", False),
+    ("fixme", False),
+    ("hack", False),
+    # ── Short / empty-like (False) ───────────────────────────────────
+    ("a", False),
+    ("ab", False),
+    ("abc", False),
+    ("xyz", False),
+    ("n/a", False),
+    ("na", False),
+    ("none", False),
+    ("nil", False),
+    ("null", False),
+    ("void", False),
+    ("blank", False),
+    ("empty", False),
+    ("tbd", False),
+    ("wip", False),
+    ("temp", False),
+    ("tmp", False),
+    # ── Brush-off / deferral patterns (False) ────────────────────────
+    ("pre-existing", False),
+    ("preexisting", False),
+    ("baseline", False),
+    ("base-line", False),
+    ("temporary", False),
+    ("existing", False),
+    ("as-is", False),
+    ("legacy", False),
+    ("will fix", False),
+    ("later", False),
+    ("eventually", False),
+    ("someday", False),
+    ("placeholder", False),
+    ("stub here", False),
+    ("for now", False),
+    ("to do", False),
+    ("fixme later", False),
+    ("carryover", False),
+    ("pre existing", False),
+    ("in baseline", False),
+    ("was already", False),
+    ("not my code", False),
+    ("carry over", False),
+    ("from before", False),
+    ("carry from", False),
+    ("pre-existing issue", False),
+    ("baseline issue", False),
+    ("todo later", False),
+    ("existing issue", False),
+    ("will fix later", False),
+    ("fix later", False),
+    ("preexisting issue", False),
+)
 
 
 class TestSemanticThreshold:
-    """Exercises ``check_if_meaningful`` with >50 realistic comments.
+    """Exercises ``check_if_meaningful`` across the deduped heuristic table.
 
     The semantic NLP pipeline is disabled via environment variable so
     the heuristic fallback is always used — no model download, no cache,
     no ``@pytest.mark.slow`` marker needed.
     """
 
-    # ── Meaningful comments (should return True) ──────────────────────
-
-    @pytest.mark.parametrize(
-        "comment",
-        [
-            # Technical code-review justifications
-            "circular import — PyLinter not available at runtime",
-            "type stub not yet generated for this module",
-            "third-party library has no type stubs available",
-            "conditional import guarded by TYPE_CHECKING",
-            "runtime attribute set by C extension, not visible to pylint",
-            "this module is generated by protobuf compiler",
-            "import is only used for type checking, not at runtime",
-            "function is overridden in subclass with different signature",
-            "variable assigned in except handler, not defined in all paths",
-            "nested function closure captures variable by reference",
-            "abstract method implemented in concrete subclass",
-            "property setter defined in parent class",
-            "metaclass conflict resolved at runtime",
-            "dynamic attribute set by __getattr__",
-            "module-level __all__ controls public API",
-            "re-export for backwards compatibility",
-            "alias for renamed external dependency",
-            "conditional import for Python version compatibility",
-            "platform-specific code path for Windows",
-            "mock object used in test fixture setup",
-            "fixture parameter injected by pytest",
-            "async generator needs manual cleanup in __aenter__",
-            "context manager wraps low-level resource handle",
-            "descriptor protocol implemented via __set_name__",
-            "singleton pattern uses __new__ override",
-            "dataclass field with default_factory",
-            "enum member with custom __init__ parameters",
-            "mixin class designed for cooperative multiple inheritance",
-            "abstract property defined in ABC base class",
-            "classmethod used as alternative constructor",
-        ],
-    )
-    def test_meaningful_comment(self, comment: str) -> None:
-        """A genuinely meaningful justification should pass."""
-        with patch.dict("os.environ", {"PYTHON_SETUP_LINT_SEMANTIC": "0"}):
-            result = check_if_meaningful(comment)
-        assert result is True, f"Expected True for meaningful comment: {comment!r}"
-
-    # ── Meaningless comments (should return False) ────────────────────
-
     @pytest.mark.parametrize(
-        "comment",
-        [
-            # Placeholder / vague single words
-            "TODO",
-            "fix this",
-            "need to check",
-            "maybe later",
-            "not sure",
-            "hmm",
-            "???",
-            "lol",
-            "wtf",
-            "nice",
-            "good",
-            "bad",
-            "ok",
-            "done",
-            "fixed",
-            "works",
-            "broken",
-            "test",
-            "check",
-            "update",
-            "remove",
-            "add",
-            "change",
-            "fix",
-            "improve",
-            "refactor",
-            # Boilerplate
-            "noqa",
-            "ignore",
-            "suppress",
-            "disable",
-            "skip",
-            "todo",
-            "fixme",
-            "hack",
-            # Short / empty-like
-            "a",
-            "ab",
-            "abc",
-            "xyz",
-            "n/a",
-            "na",
-            "none",
-            "nil",
-            "null",
-            "void",
-            "blank",
-            "empty",
-            "tbd",
-            "wip",
-            "temp",
-            "tmp",
-        ],
+        ("comment", "expected"),
+        _HEURISTIC_CASES,
+        ids=[comment for comment, _ in _HEURISTIC_CASES],
     )
-    def test_meaningless_comment(self, comment: str) -> None:
-        """A meaningless justification should fail."""
+    def test_heuristic_outcome(self, comment: str, expected: bool) -> None:
+        """The heuristic must reproduce each pinned outcome."""
         with patch.dict("os.environ", {"PYTHON_SETUP_LINT_SEMANTIC": "0"}):
             result = check_if_meaningful(comment)
-        assert result is False, f"Expected False for meaningless comment: {comment!r}"
+        assert result is expected, f"Expected {expected} for comment: {comment!r}"

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
