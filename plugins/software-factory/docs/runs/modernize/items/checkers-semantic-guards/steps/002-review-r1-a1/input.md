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
  "slug": "checkers-semantic-guards",
  "kind": "test-only",
  "title": "Guard heuristic checker tests with SEMANTIC=0",
  "assignment": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "checkers-semantic-guards",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Threshold deduped plus guards pinned"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
    "CodingRules.md:230-306"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..498b9fd
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/checks.yaml
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
+        durationMs: 335
+        details: 182 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 84223
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
+          Success: No issues found in 29 files (23ms)
+
+          ============================================================
+          [mypy] PASSED [8.5s]
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
+          [mypy.stubtest] PASSED [10.3s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.6s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794185108600",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.932
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
+          [pylint] PASSED [13.7s]
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
+          [pylint-pyi] PASSED [13.2s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [21.6s]
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
+          [detect-secrets] PASSED [8.4s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-semantic-guards/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 37447
+        details: |-
+          [Tach] 1400 tests in 60 files unaffected by changes (~33.8s could be saved). Skip with: pytest --tach
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
+          ........................................................................ [ 72%]
+          ........................................................................ [ 78%]
+          ........................................................................ [ 83%]
+          ........................................................................ [ 88%]
+          ........................................................................ [ 93%]
+          ........................................................................ [ 98%]
+          ..............                                                           [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-semantic-guards/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-semantic-guards/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-semantic-guards/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1378 passed, 4 skipped, 18 deselected, 4 warnings in 34.97s
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
+        durationMs: 86268
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 85.01s (0:01:25)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (2 test files changed)
diff --git a/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..565080e
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/input.md
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
+  "slug": "checkers-semantic-guards",
+  "kind": "test-only",
+  "title": "Guard heuristic checker tests with SEMANTIC=0",
+  "assignment": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
+  "outlineRef": "checkers-semantic-guards",
+  "milestone": "M2",
+  "wave": 1,
+  "scenarioRefs": [
+    "M2: Threshold deduped plus guards pinned"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
+    "CodingRules.md:230-306"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
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
diff --git a/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..76d3b1f
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T00:32:50.427Z
+session: 01a1bdb9-40b5-7438-ba8b-54399d15cb8c
+endedAt: 2026-11-09T00:48:10.892Z
+usage:
+  inputTokens: 43927
+  outputTokens: 23565
+  costUsd: 0.02546
+repairedFrom: ask
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T00-33-16-981Z_01a1bdb9-40b5-7438-ba8b-54399d15cb8c
diff --git a/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..890eaba
--- /dev/null
+++ b/.factory/tasks/modernize/items/checkers-semantic-guards/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,47 @@
+status: ok
+summary: 'Guarded all 51 heuristic checker tests (40 W9704 suppression + 11
+  W9738 bare-except) with a monkeypatched SEMANTIC=0 fixture, leaving
+  TestSuppressionRerankerPipeline untouched for the M4 second writer. Each
+  module defines a `_semantic_disabled` fixture that calls
+  `monkeypatch.setenv("PYTHON_SETUP_LINT_SEMANTIC", "0")`; heuristic test
+  classes opt in via `@pytest.mark.usefixtures("_semantic_disabled")`. Added the
+  repo-standard justified `# pylint: disable=W9728` reason on the fixture defs
+  to keep lint clean. Tests-only diff: 2 files, +22 lines, 0 deletions; golden
+  fixtures untouched.'
+target:
+  command: uv run pytest tests/checkers/test_suppression_justification_checker.py
+    tests/checkers/test_bare_except_comment_checker.py -q
+  customTarget: true
+evidence:
+  - "Test recount at HEAD via `--collect-only -q`: 40 heuristic suppression
+    tests (TestJustifiedSuppressions 5, TestUnjustifiedSuppressions 8,
+    TestDataStrings 11, TestFunctionParamReturnAny 16) and 11 bare-except tests
+    (3+3+3+2); 2 slow TestSuppressionRerankerPipeline tests deselected."
+  - "Target tests after guards: `uv run pytest
+    tests/checkers/test_suppression_justification_checker.py
+    tests/checkers/test_bare_except_comment_checker.py -q` -> 51 passed, 2
+    deselected."
+  - "Guard efficacy proof: temporarily ran with `PYTHONPATH=$PWD/tests/checkers
+    PYTHON_SETUP_LINT_SEMANTIC=1 ... -p _semantic_probe_plugin` where the probe
+    stubbed `_semantic.semantic_check_if_meaningful` to always return False; all
+    51 heuristic tests still passed, proving the monkeypatched SEMANTIC=0 guard
+    bypasses the semantic pipeline. Probe file deleted afterward (git status
+    shows only the two intended test files)."
+  - "Full checkers suite: `uv run pytest tests/checkers -q` -> 666 passed, 4
+    skipped, 5 deselected."
+  - "Golden round-trip tests: `uv run pytest tests/test_golden.py -q` -> 31
+    passed; `git status --short` confirms no golden files changed (hash-equal)."
+  - "Full unit suite: `uv run pytest -q` -> 1378 passed, 4 skipped, 18
+    deselected, 0 failures."
+  - "Project gate: `uv run lint` -> returncode 0 (all 14 tools PASSED; pylint
+    tests 10.00/10)."
+  - "Reranker block untouched: `git diff ... | grep
+    TestSuppressionRerankerPipeline` returns nothing; diff is additions only
+    (+22, 0 deletions)."
+concerns:
+  - None. LSP emitted only hints (fixtures referenced via usefixtures string are
+    statically 'unaccessed'); tests/ is excluded from the pyright gate and lint
+    is clean.
+notes: Guards are class-scoped via usefixtures rather than module autouse so the
+  slow TestSuppressionRerankerPipeline block can keep exercising the real
+  semantic/reranker path and remain untouched for M4.
diff --git a/tests/checkers/test_bare_except_comment_checker.py b/tests/checkers/test_bare_except_comment_checker.py
index b2d01e0..bd72716 100644
--- a/tests/checkers/test_bare_except_comment_checker.py
+++ b/tests/checkers/test_bare_except_comment_checker.py
@@ -7,6 +7,8 @@ from __future__ import annotations
 
 from typing import Any
 
+import pytest
+
 from python_setup_lint.checkers.conformance.bare_except_comment_checker import (
     BareExceptCommentChecker,
 )
@@ -32,6 +34,13 @@ def _msg_ids(msgs: list[Any]) -> set[str]:
     return {m.msg_id for m in msgs}
 
 
+@pytest.fixture
+def _semantic_disabled(monkeypatch: pytest.MonkeyPatch) -> None:  # pylint: disable=W9728  # test fixture: single place pinning SEMANTIC=0 across heuristic tests
+    """Pin heuristic tests to the deterministic heuristic path (no NLP reranker)."""
+    monkeypatch.setenv("PYTHON_SETUP_LINT_SEMANTIC", "0")
+
+
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestDetectsBareExceptWithoutComment:
     """Checker must emit W9738 for bare except without justification."""
 
@@ -72,6 +81,7 @@ except:
         assert msgs[0].msg_id == "bare-except-comment"
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestSkipsBareExceptWithComment:
     """Checker must NOT flag bare except with justifying comment."""
 
@@ -110,6 +120,7 @@ except Exception:  # expected during shutdown
         assert len(msgs) == 0
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestSkipsBareExceptWithReraise:
     """Checker must NOT flag bare except that re-raises."""
 
@@ -149,6 +160,7 @@ except:
         assert len(msgs) == 0
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestSkipsNamedExcept:
     """Checker must NOT flag named except handlers (not bare)."""
 
diff --git a/tests/checkers/test_suppression_justification_checker.py b/tests/checkers/test_suppression_justification_checker.py
index e6415bd..8ddf9f6 100644
--- a/tests/checkers/test_suppression_justification_checker.py
+++ b/tests/checkers/test_suppression_justification_checker.py
@@ -20,6 +20,13 @@ def _msg_ids(msgs: list[Any]) -> set[str]:
     return {m.msg_id for m in msgs}
 
 
+@pytest.fixture
+def _semantic_disabled(monkeypatch: pytest.MonkeyPatch) -> None:  # pylint: disable=W9728  # test fixture: single place pinning SEMANTIC=0 across heuristic tests
+    """Pin heuristic tests to the deterministic heuristic path (no NLP reranker)."""
+    monkeypatch.setenv("PYTHON_SETUP_LINT_SEMANTIC", "0")
+
+
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestJustifiedSuppressions:
     """Checker must NOT flag suppressions with a technical reason."""
 
@@ -61,6 +68,7 @@ def foo() -> None:
         assert len(msgs) == 0, f"Expected no messages, got {msgs}"
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestUnjustifiedSuppressions:
     """Checker MUST flag suppressions without a technical reason."""
 
@@ -126,6 +134,7 @@ x = 1  # noqa: E501  # ok
         assert len(msgs) == 1, f"Expected 1 message for real # noqa, got {msgs}"
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestDataStrings:
     """Checker must NOT flag suppression patterns inside string literals."""
 
@@ -213,6 +222,7 @@ x = 1
         assert len(msgs) == 0, f"Expected 0 messages, got {msgs}"
 
 
+@pytest.mark.usefixtures("_semantic_disabled")
 class TestFunctionParamReturnAny:
     # Checker must flag Any in function params/returns without per-line
     # justification, but only under source roots (src/).  Test files are

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
