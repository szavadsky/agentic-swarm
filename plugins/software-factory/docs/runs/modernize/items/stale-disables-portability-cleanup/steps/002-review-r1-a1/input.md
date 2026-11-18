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
  "slug": "stale-disables-portability-cleanup",
  "kind": "test-only",
  "title": "Remove stale disables and hardcoded paths",
  "assignment": "Tests-only, owns ONLY 4 files (tests/runner/test_lint_runner_integration.py, tests/conftest.py, tests/runner/test_setup.py, tests/runner/test_setup_install.py); FORBIDDEN test_lint_runner.py (dispatch-split owns incl its :7 disable), test_autofix_conflict_integration.py + test_t9_7_compose_pyright_live.py + 4 self-lint files (prune owns). Red-test-exempt. Remove stale too-many-lines disables (recount lines at HEAD; 479/418 per pack, verify under-500); replace /home/slava paths (conftest.py:86, test_setup.py:252,277, test_setup_install.py:265-350, verify) with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; no new failures vs M1 table; golden hash-equal; grep zero hardcoded checkout in touched files.",
  "outlineRef": "stale-disables-portability-cleanup",
  "milestone": "M2",
  "wave": 3,
  "scenarioRefs": [
    "M2: Portability cleaned in owned files"
  ],
  "citations": [
    "CodingRules.md:139-159",
    "CodingRules.md:230-306"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..345f958
--- /dev/null
+++ b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/checks.yaml
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
+        details: 192 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 82685
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
+          Success: No issues found in 29 files (20ms)
+
+          ============================================================
+          [mypy] PASSED [7.1s]
+          ============================================================
+          Success: no issues found in 57 source files
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
+          [mypy.stubtest] PASSED [10.6s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.0s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794202851892",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 112,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.402
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
+          [pylint] PASSED [12.3s]
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
+          [pylint-pyi] PASSED [13.0s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [22.7s]
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
+                  "modulesLinted": 84,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] PASSED [9.3s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--stale-disables-portability-cleanup/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 37689
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~23.9s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--stale-disables-portability-cleanup/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--stale-disables-portability-cleanup/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--stale-disables-portability-cleanup/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 35.56s
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
+        durationMs: 74009
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 72.86s (0:01:12)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (4 test files changed)
diff --git a/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..60b1a76
--- /dev/null
+++ b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/input.md
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
+  "slug": "stale-disables-portability-cleanup",
+  "kind": "test-only",
+  "title": "Remove stale disables and hardcoded paths",
+  "assignment": "Tests-only, owns ONLY 4 files (tests/runner/test_lint_runner_integration.py, tests/conftest.py, tests/runner/test_setup.py, tests/runner/test_setup_install.py); FORBIDDEN test_lint_runner.py (dispatch-split owns incl its :7 disable), test_autofix_conflict_integration.py + test_t9_7_compose_pyright_live.py + 4 self-lint files (prune owns). Red-test-exempt. Remove stale too-many-lines disables (recount lines at HEAD; 479/418 per pack, verify under-500); replace /home/slava paths (conftest.py:86, test_setup.py:252,277, test_setup_install.py:265-350, verify) with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; no new failures vs M1 table; golden hash-equal; grep zero hardcoded checkout in touched files.",
+  "outlineRef": "stale-disables-portability-cleanup",
+  "milestone": "M2",
+  "wave": 3,
+  "scenarioRefs": [
+    "M2: Portability cleaned in owned files"
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
diff --git a/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..61d6f1e
--- /dev/null
+++ b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T05:33:00.195Z
+session: 01a1becb-ad1c-76e6-9daf-c3e407b2f33c
+endedAt: 2026-11-09T05:43:42.390Z
+usage:
+  inputTokens: 47494
+  outputTokens: 17162
+  costUsd: 0.021208
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T05-33-01-596Z_01a1becb-ad1c-76e6-9daf-c3e407b2f33c.jsonl
diff --git a/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..dba9b2f
--- /dev/null
+++ b/.factory/tasks/modernize/items/stale-disables-portability-cleanup/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,45 @@
+status: ok
+summary: "Test-only cleanup of the 4 owned files: removed the stale `pylint:
+  disable=too-many-lines` from tests/runner/test_lint_runner_integration.py (414
+  lines < 500 threshold) and dropped its now-invalid rationale sentence; added a
+  session-scoped `python_setup_checkout` fixture in tests/conftest.py returning
+  the repo root and replaced all 8 hardcoded `/home/slava/aiexp/python-setup`
+  dev-path literals across conftest.py, test_setup.py (2) and
+  test_setup_install.py (5) with `str(python_setup_checkout)`. Re-applied ruff
+  formatting with the shipped line-length=130 config. Full suite and lint gate
+  green; golden snapshots byte-identical."
+target:
+  command: uv run pytest -q
+  customTarget: false
+evidence:
+  - "Baseline (pre-change): `uv run pytest -q` -> 1377 passed, 13 deselected, 0
+    failed"
+  - "After changes: `uv run pytest -q` -> 1377 passed, 13 deselected, 0 failed
+    (no new failures vs baseline/M1)"
+  - "Owned files: `uv run pytest tests/runner/test_setup.py
+    tests/runner/test_setup_install.py
+    tests/runner/test_lint_runner_integration.py -q` -> 112 passed, 2
+    deselected"
+  - "Golden: `uv run pytest tests/test_golden.py -q` -> 31 passed; sha256 of
+    tests/data/golden/* unchanged (c2b8dc3a... findings, 1d239741...
+    tool_counts)"
+  - "Lint gate: `uv run lint` -> EXIT=0, all tools PASSED including [ruff
+    format], [pylint tests], [detect-secrets]"
+  - "`grep -rn '/home/slava' tests/conftest.py tests/runner/test_setup.py
+    tests/runner/test_setup_install.py
+    tests/runner/test_lint_runner_integration.py` -> no matches (exit 1)"
+  - "`wc -l tests/runner/test_lint_runner_integration.py` -> 414 (<500
+    max-module-lines); `grep too-many-lines` on owned files -> no matches"
+  - "`git status --short` -> only the 4 owned files modified"
+concerns:
+  - The `@pytest.mark.slow` downstream integration test remains deselected by
+    default (repo addopts `-m 'not slow'`); it now uses the portable fixture but
+    writes its scratch project under `Path.home()/.tmp`, which is out of the
+    assigned `/home/slava` scope.
+  - Stale too-many-lines disables in tests/runner/test_lint_runner.py and
+    tests/runner/_factories_extras.py were intentionally left untouched (owned
+    by other work streams).
+notes: No production code touched. Fixture is session-scoped to match its
+  consumer (`configured_project`) and derives the checkout path from
+  `Path(__file__).resolve().parents[1]`, so it works in any clone/worktree
+  without environment assumptions.
diff --git a/tests/conftest.py b/tests/conftest.py
index 3b202ff..3dcef10 100644
--- a/tests/conftest.py
+++ b/tests/conftest.py
@@ -59,7 +59,13 @@ def empty_project(tmp_path: Path) -> Path:
 
 
 @pytest.fixture(scope="session")
-def configured_project(tmp_path_factory: pytest.TempPathFactory) -> Path:
+def python_setup_checkout() -> Path:
+    """Return this repo's checkout root — the ``--dev-path`` target for install tests."""
+    return Path(__file__).resolve().parents[1]
+
+
+@pytest.fixture(scope="session")
+def configured_project(tmp_path_factory: pytest.TempPathFactory, python_setup_checkout: Path) -> Path:
     """Run install once on a session-scoped temp dir, return the configured dir.
 
     Session-scoped — install runs once per test session.
@@ -83,7 +89,7 @@ def configured_project(tmp_path_factory: pytest.TempPathFactory) -> Path:
     agents = d / "AGENTS.md"
     agents.write_text("# Test Project\n\nSome content.\n")
 
-    rc = install(d, dev_path="/home/slava/aiexp/python-setup")
+    rc = install(d, dev_path=str(python_setup_checkout))
     assert rc == 0
     return d
 
diff --git a/tests/runner/test_lint_runner_integration.py b/tests/runner/test_lint_runner_integration.py
index d76cbe7..d0c5416 100644
--- a/tests/runner/test_lint_runner_integration.py
+++ b/tests/runner/test_lint_runner_integration.py
@@ -1,8 +1,4 @@
-# pylint: disable=too-many-lines  # integration test suite; splitting would lose shared fixture context
-"""Unit tests for baseline/diff/overwrite/print/orchestration/CLI/integration in ``python_setup_lint.runner``.
-
-Splitting would lose context.
-"""
+"""Unit tests for baseline/diff/overwrite/print/orchestration/CLI/integration in ``python_setup_lint.runner``."""
 
 # pylint: disable=too-many-positional-arguments  # parametrized test with 6 args; pylint default is 5
 from __future__ import annotations
diff --git a/tests/runner/test_setup.py b/tests/runner/test_setup.py
index a727d05..fd369b5 100644
--- a/tests/runner/test_setup.py
+++ b/tests/runner/test_setup.py
@@ -241,7 +241,7 @@ class TestUpdate:
 
 
 class TestMainCLI:
-    def test_main_cli_given_install_then_installs(self, empty_project: Path) -> None:
+    def test_main_cli_given_install_then_installs(self, empty_project: Path, python_setup_checkout: Path) -> None:
         assert (
             main(
                 [
@@ -249,14 +249,14 @@ class TestMainCLI:
                     "--path",
                     str(empty_project),
                     "--dev-path",
-                    "/home/slava/aiexp/python-setup",
+                    str(python_setup_checkout),
                 ]
             )
             == 0
         )
         assert (empty_project / ".pre-commit-config.yaml").exists()
 
-    def test_main_cli_given_install_default_cwd_then_installs(self, tmp_path: Path) -> None:
+    def test_main_cli_given_install_default_cwd_then_installs(self, tmp_path: Path, python_setup_checkout: Path) -> None:
         (tmp_path / "pyproject.toml").write_text(
             textwrap.dedent("""\
             [project]
@@ -274,7 +274,7 @@ class TestMainCLI:
                     "--path",
                     str(tmp_path),
                     "--dev-path",
-                    "/home/slava/aiexp/python-setup",
+                    str(python_setup_checkout),
                 ]
             )
             == 0
diff --git a/tests/runner/test_setup_install.py b/tests/runner/test_setup_install.py
index 73d3ddd..64779ac 100644
--- a/tests/runner/test_setup_install.py
+++ b/tests/runner/test_setup_install.py
@@ -261,31 +261,33 @@ class TestInstall:
     """Fresh install tests."""
 
     @pytest.mark.parametrize("check_fn", INSTALL_ARTIFACT_CASES)
-    def test_install_given_fresh_project_then_creates_artifacts(self, empty_project: Path, check_fn: object) -> None:
-        assert install(empty_project, dev_path="/home/slava/aiexp/python-setup") == 0
+    def test_install_given_fresh_project_then_creates_artifacts(
+        self, empty_project: Path, python_setup_checkout: Path, check_fn: object
+    ) -> None:
+        assert install(empty_project, dev_path=str(python_setup_checkout)) == 0
         check_fn(empty_project)  # type: ignore[operator]  # parametrized callable; type varies by fixture
 
 
 class TestInstallEdgeCases:
     """Install edge cases: idempotency, existing files, missing pyproject."""
 
-    def test_second_install_skips_dep(self, configured_project: Path) -> None:
+    def test_second_install_skips_dep(self, configured_project: Path, python_setup_checkout: Path) -> None:
         deps_before = _get_dev_deps(_read_pyproject_toml(configured_project))  # type: ignore[arg-type]  # _read_pyproject_toml returns dict|None; fixture ensures valid project
-        assert install(configured_project, dev_path="/home/slava/aiexp/python-setup") == 0
+        assert install(configured_project, dev_path=str(python_setup_checkout)) == 0
         assert _get_dev_deps(_read_pyproject_toml(configured_project)) == deps_before  # type: ignore[arg-type]  # _read_pyproject_toml returns dict|None; fixture ensures valid project
 
     def test_install_given_second_install_then_no_dup(self, configured_project: Path) -> None:
         assert (configured_project / "AGENTS.md").read_text().count(_AGENTS_SENTINEL) == 1
 
-    def test_install_given_existing_precommit_then_skips(self, empty_project: Path) -> None:
+    def test_install_given_existing_precommit_then_skips(self, empty_project: Path, python_setup_checkout: Path) -> None:
         p = empty_project / ".pre-commit-config.yaml"
         p.write_text("# e")
         m = p.stat().st_mtime
-        assert install(empty_project, dev_path="/home/slava/aiexp/python-setup") == 0
+        assert install(empty_project, dev_path=str(python_setup_checkout)) == 0
         assert p.stat().st_mtime == m and p.read_text() == "# e"
 
-    def test_install_given_missing_pyproject_then_returns_error(self, tmp_path: Path) -> None:
-        assert install(tmp_path, dev_path="/home/slava/aiexp/python-setup") == 1
+    def test_install_given_missing_pyproject_then_returns_error(self, tmp_path: Path, python_setup_checkout: Path) -> None:
+        assert install(tmp_path, dev_path=str(python_setup_checkout)) == 1
 
 
 class TestStepErrorPaths:
@@ -311,7 +313,7 @@ class TestDownstreamIntegration:
     """End-to-end install-then-lint integration test."""
 
     @pytest.mark.slow
-    def test_downstream_integration_given_install_then_lint(self) -> None:
+    def test_downstream_integration_given_install_then_lint(self, python_setup_checkout: Path) -> None:
         import shutil
         import subprocess
 
@@ -347,7 +349,7 @@ class TestDownstreamIntegration:
             '{"version":"1.0","plugins_used":[],"filters_used":[],"results":{},"generated_at":"2025-01-01T00:00:00Z"}\n'
         )
         (c / "tach.toml").write_text('[[modules]]\npath = "src/consumer"\ndepends_on = []\n')
-        assert install(c, dev_path="/home/slava/aiexp/python-setup") == 0
+        assert install(c, dev_path=str(python_setup_checkout)) == 0
         assert (c / ".pre-commit-config.yaml").exists()
         assert (c / "CodingRules.md").exists()
         assert "<!-- python-setup:pre-commit -->" in (c / "AGENTS.md").read_text()

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
