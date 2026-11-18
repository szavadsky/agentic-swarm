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
  "slug": "never-test-linting-prune",
  "kind": "test-only",
  "title": "Prune gate-duplicating tests with survivors",
  "assignment": "Tests-only, owns ONLY 6 files wholly (tests/runner/test_self_lint_clean.py, test_config_consistency.py, test_pyright_noise_filter.py, test_runner_private_imports.py, test_t9_7_compose_pyright_live.py, test_autofix_conflict_integration.py); FORBIDDEN all other test files. Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); hardcoded paths inside owned files handled here (file deleted or path fixed); each removal names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept; a named default-collected survivor is allowed only if the report proves smoke itself violates never-test-linting. Keep golden/integration contracts. Verify: tests only; removal-to-survivor map in report; pytest (minus removed) + integration show no new failures vs M1 table; golden hash-equal.",
  "outlineRef": "never-test-linting-prune",
  "milestone": "M2",
  "wave": 4,
  "scenarioRefs": [
    "M2: Gate-duplicating tests pruned with pin retained"
  ],
  "citations": [
    "AGENTS.md:87-93",
    "CodingRules.md:230-306",
    "lint.baseline:1"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..f4015ff
--- /dev/null
+++ b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/checks.yaml
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
+        durationMs: 271
+        details: 191 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 74178
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
+          Success: No issues found in 29 files (22ms)
+
+          ============================================================
+          [mypy] PASSED [7.0s]
+          ============================================================
+          Success: no issues found in 58 source files
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
+          [mypy.stubtest] PASSED [8.2s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.5s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794206491874",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 114,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.838
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
+          [pylint] PASSED [12.7s]
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
+                  "modulesLinted": 60,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [pylint-pyi] PASSED [11.7s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [17.7s]
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
+                  "modulesLinted": 81,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [detect-secrets] PASSED [8.8s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--never-test-linting-prune/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 30374
+        details: |-
+          [Tach] 1364 tests in 56 files unaffected by changes (~27.3s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ........................................................................ [ 15%]
+          ........................................................................ [ 21%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 37%]
+          ........................................................................ [ 42%]
+          ........................................................................ [ 47%]
+          ........................................................................ [ 53%]
+          ........................................................................ [ 58%]
+          ........................................................................ [ 63%]
+          ........................................................................ [ 68%]
+          ........................................................................ [ 74%]
+          ........................................................................ [ 79%]
+          ........................................................................ [ 84%]
+          ........................................................................ [ 90%]
+          ........................................................................ [ 95%]
+          .............................................................            [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--never-test-linting-prune/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--never-test-linting-prune/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--never-test-linting-prune/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1357 passed, 7 deselected, 4 warnings in 28.39s
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
+        durationMs: 71602
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 7s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 70.50s (0:01:10)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (6 test files changed)
diff --git a/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..76247dc
--- /dev/null
+++ b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/input.md
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
+  "slug": "never-test-linting-prune",
+  "kind": "test-only",
+  "title": "Prune gate-duplicating tests with survivors",
+  "assignment": "Tests-only, owns ONLY 6 files wholly (tests/runner/test_self_lint_clean.py, test_config_consistency.py, test_pyright_noise_filter.py, test_runner_private_imports.py, test_t9_7_compose_pyright_live.py, test_autofix_conflict_integration.py); FORBIDDEN all other test files. Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); hardcoded paths inside owned files handled here (file deleted or path fixed); each removal names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept; a named default-collected survivor is allowed only if the report proves smoke itself violates never-test-linting. Keep golden/integration contracts. Verify: tests only; removal-to-survivor map in report; pytest (minus removed) + integration show no new failures vs M1 table; golden hash-equal.",
+  "outlineRef": "never-test-linting-prune",
+  "milestone": "M2",
+  "wave": 4,
+  "scenarioRefs": [
+    "M2: Gate-duplicating tests pruned with pin retained"
+  ],
+  "citations": [
+    "AGENTS.md:87-93",
+    "CodingRules.md:230-306",
+    "lint.baseline:1"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "AGENTS.md:87-93",
+  "CodingRules.md:230-306",
+  "lint.baseline:1"
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
diff --git a/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..d7e4e2d
--- /dev/null
+++ b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T06:32:25.162Z
+session: 01a1bf02-11ad-752c-96c1-d8afbfcb88d0
+endedAt: 2026-11-09T06:44:06.426Z
+usage:
+  inputTokens: 68798
+  outputTokens: 30556
+  costUsd: 0.034707
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T06-32-26-285Z_01a1bf02-11ad-752c-96c1-d8afbfcb88d0.jsonl
diff --git a/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..9ce5cc7
--- /dev/null
+++ b/.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,66 @@
+status: ok
+summary: "Pruned gate-duplicating tests from the six owned files: deleted
+  test_self_lint_clean.py, test_config_consistency.py,
+  test_pyright_noise_filter.py, and test_t9_7_compose_pyright_live.py wholesale;
+  reduced test_runner_private_imports.py to the runtime __all__ public-surface
+  unit test; and removed TestRunLintFixDownstream plus the
+  TestPrecommitTemplateHasFix config re-checks from
+  test_autofix_conflict_integration.py, keeping TestRunLintFixDispatch (unit)
+  and TestAutofixRealGitIntegration (integration). The default full-pipeline pin
+  tests/runner/test_real_pipeline_smoke.py was left untouched and still passes;
+  no additional default-collected full-pipeline survivor was kept. 682 lines
+  removed, 4 added; no production code changed."
+target:
+  command: uv run pytest -q && uv run pytest tests/integration.py -q && uv run lint
+  customTarget: true
+evidence:
+  - "Pre-change baseline: `uv run pytest -q` -> 1377 passed, 13 deselected, 4
+    warnings in 33.82s"
+  - "Post-change: `uv run pytest -q` -> 1357 passed, 7 deselected, 4 warnings in
+    30.75s (delta exactly the 20 default-collected + 6 slow removed tests; no
+    new failures)"
+  - "Post-change: `uv run pytest tests/integration.py -q` -> 9 passed in 67.36s
+    (pre-change baseline was also 9 passed in 72.93s)"
+  - "Golden: `uv run pytest tests/test_golden.py -q` -> 31 passed; `git status
+    --short` lists only the 6 owned test files (no golden/config/prod files
+    touched)"
+  - "Full lint gate: `bash -o pipefail -c 'uv run lint'` -> LINT_EXIT:0, all 14
+    tools PASSED (pylint tests score 10.0/10), 66s"
+  - "Touched-file quality: `uv run ruff format --check --config
+    config/ruff.toml` -> 2 files already formatted; `uv run ruff check --config
+    config/ruff.toml` -> All checks passed"
+  - "Retained owned tests: `uv run pytest
+    tests/runner/test_autofix_conflict_integration.py
+    tests/runner/test_runner_private_imports.py -q` -> 7 passed (6 autofix: 3
+    dispatch unit + 3 real-git integration; 1 __all__ unit)"
+  - "Full-pipeline pin: `uv run pytest --collect-only -q
+    tests/runner/test_real_pipeline_smoke.py` -> 1 test collected by default
+    (test_consolidated_real_pipeline_smoke)"
+  - "Slow survivors: `uv run pytest --collect-only -q -m slow` -> 7 collected,
+    1357 deselected; none belong to pruned files"
+  - "Portability: grep for `/home/` or `aiexp` in surviving owned files -> no
+    hardcoded checkout paths"
+  - "Test-only diff: `git diff --stat` -> 6 files changed, 4 insertions(+), 682
+    deletions(-); no src/, config/, golden, or docs changes"
+concerns:
+  - Stale docstring cross-reference remains in the forbidden file
+    tests/runner/test_t9_7_compose_pyright.py:20, which still mentions the
+    deleted test_t9_7_compose_pyright_live.py; it does not affect runtime or
+    lint but should be cleaned by that file's owner.
+  - "Pre-commit `--fix` artifact coverage now relies on existing survivors
+    outside the owned set: tests/runner/test_setup_install.py::_ck_precommit
+    (asserts installed .pre-commit-config.yaml contains 'lint --fix --baseline
+    lint.baseline') and tests/integration.py pre-commit
+    validate-config/dry-run."
+notes: |-
+  Removal -> survivor map (per never-test-linting boundary):
+  1) tests/runner/test_self_lint_clean.py (1 slow subprocess re-lint) -> default full-pipeline pin tests/runner/test_real_pipeline_smoke.py::test_consolidated_real_pipeline_smoke + `uv run lint` gate.
+  2) tests/runner/test_config_consistency.py (11 config re-checks of shipped .pylintrc*) -> configs are the source of truth; assumption test tests/assumptions/test_pylint_cache_semantics.py exercises the real shipped rc files, and `uv run lint` runs pylint with them.
+  3) tests/runner/test_pyright_noise_filter.py (2 slow subprocess re-lints) -> unit survivor tests/runner/test_lint_runner.py::TestSummarizePyrightVerifyTypes (4 cases covering score/fallback/malformed/non-dict).
+  4) tests/runner/test_t9_7_compose_pyright_live.py (2 slow live-pyright tests + hardcoded /home/slava/.../.venv/bin/pyright) -> unit survivor tests/runner/test_t9_7_compose_pyright.py (compose fast-path/copy/cwd/run_lint-wire tests, no live pyright).
+  5) test_runner_private_imports.py::test_runner_imports_given_runner_namespace_then_no_private_symbols (duplicate __all__ assertion) -> kept unit test_runner_imports_given_runner_all_then_no_private_symbols.
+  6) test_runner_private_imports.py::test_runner_imports_given_init_then_no_private_submodule (regex source scan = lint re-implementation) -> kept runtime __all__ unit + tach check gate.
+  7) test_runner_private_imports.py::test_tests_import_privates_only_from_defining_submodule (AST re-implementation of import hygiene) -> unit survivor tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects + tach/lint gates.
+  8) test_autofix_conflict_integration.py::TestRunLintFixDownstream::test_run_lint_fix_given_downstream_then_does_not_crash (slow full-repo subprocess re-lint) -> TestRunLintFixDispatch (3 unit canary/dispatch cases) + TestAutofixRealGitIntegration (3 real-git conflict/staged-only/E999-revert integration cases) + pre-commit `lint --fix` hook.
+  9) TestPrecommitTemplateHasFix (6 template/config text re-checks, incl hardcoded dev_path=/home/slava/aiexp/python-setup) -> tests/runner/test_setup_install.py::TestInstall::test_install_given_fresh_project_then_creates_artifacts[writes_precommit] (portable python_setup_checkout fixture) + tests/integration.py pre-commit validate-config/dry-run.
+  Hardcoded paths: the /home/slava pyright path and the /home/slava checkout dev_path were both eliminated with their removed tests; surviving owned files contain none.
diff --git a/tests/runner/test_autofix_conflict_integration.py b/tests/runner/test_autofix_conflict_integration.py
index 71151bc..22bcaaa 100644
--- a/tests/runner/test_autofix_conflict_integration.py
+++ b/tests/runner/test_autofix_conflict_integration.py
@@ -2,7 +2,6 @@
 
 from __future__ import annotations
 
-import textwrap
 from pathlib import Path
 
 import pytest
@@ -11,7 +10,6 @@ import python_setup_lint.runner.output as _output_module
 from python_setup_lint.runner import (
     LINT_TOOLS,
     LintResult,
-    RunnerConfig,
     ToolSpec,
     run_lint,
 )
@@ -28,7 +26,6 @@ from tests._project_helpers import (
 )
 from tests.runner._autofix_helpers import (
     _CANARY_LABEL,
-    _FIX_TOOL_NAMES,
     _make_canned_fix_results,
     _PostFixFakeRunCmd,
     _setup_e999_canary_revert,
@@ -38,151 +35,6 @@ from tests.runner._factories import (
     tmp_config,
 )
 
-# ── Downstream integration: run_lint --fix on real python-setup repo ─
-
-
-class TestRunLintFixDownstream:
-    """End-to-end ``run_lint(fix=True)`` on the python-setup repo itself.
-
-    The envelope downstream-integration gate says: ``uv run lint --fix``
-    on python-setup applies at least ruff fixes and does not crash.  This
-    test runs the runner in fix mode against the repo's real src tree,
-    asserting the run completes (returns int) and that at least one
-    supports_fix tool exercised its --fix route.  Marked ``slow`` so
-    unit-only test runs (``pytest -m 'not slow'``) skip it.
-    """
-
-    @pytest.mark.slow
-    def test_run_lint_fix_given_downstream_then_does_not_crash(
-        self,
-        tmp_path: Path,
-        monkeypatch: pytest.MonkeyPatch,
-    ) -> None:
-        """Run ``run_lint(fix=True)`` to completion (returns int).
-
-        D1 (review T4-0): the prior form asserted only
-        ``isinstance(rc, int)`` — vacuously true even if ``run_lint``
-        returned 0 without iterating any tool.  Strengthened to (a) the
-        temp baseline file exists AND is non-empty (proves the runner
-        reached the baseline-save branch, which only fires after a full
-        tool-loop completion), (b) the baseline JSON parses to a list
-        with at least 9 entries (the runner's stubtest + verifytypes
-        are skipped when ``--package-name`` is unset OR when invoked
-        without the right config; here ``package_name="python_setup_lint"``
-        is set so the expected count is 9 or 11 depending on whether
-        stubtest's package is installed — assert ``>= 9`` to cover both),
-        and (c) at least one supports_fix tool's label appears in the
-        captured baseline labels (proves the autofix route was exercised
-        end-to-end against the real repo).
-        """
-        repo = Path(__file__).resolve().parent.parent.parent
-        # Use a temp baseline so the run doesn't touch the repo's checked-in
-        # baseline file.  The fix flag still applies — autofix runs the
-        # ruff/rumdl/ty fix path against the repo's real source tree.
-        baseline = tmp_path / "t4-fix-downstream.baseline"
-        config = RunnerConfig(
-            cwd=repo,
-            package_name="python_setup_lint",
-            default_py_dirs=["src", "scripts", "tests"],
-        )
-        rc = run_lint(config=config, fix=True, baseline=str(baseline))
-        assert isinstance(rc, int)
-        # (a) The baseline file was created and is non-empty — proves the
-        # runner completed the tool loop AND reached the baseline-save
-        # branch (which only fires after all tools ran).
-        assert baseline.exists(), "baseline file not created — runner did not finish"
-        assert baseline.stat().st_size > 0, f"baseline file empty: {baseline.read_text()!r}"
-        # (b) The baseline JSON parses to a list (violations list; empty on a
-        # clean repo — the runner completed the full tool loop).
-        import json as _json
-
-        entries = _json.loads(baseline.read_text(encoding="utf-8"))
-        assert isinstance(entries, list), f"baseline not a JSON list: {type(entries).__name__}"
-        # (c) The autofix route was exercised: run_lint was called with
-        # fix=True, completed (rc is int, baseline exists and parses), and
-        # the runner iterated over all tools including supports_fix tools.
-        # On this repo, fix-capable tools (ruff, rumdl, ty) produce zero
-        # violations — assert that invariant to prove they ran cleanly.
-        baseline_labels = {e.get("tool") for e in entries}
-        fix_labels_seen = baseline_labels & _FIX_TOOL_NAMES
-        assert not fix_labels_seen, f"fix-capable tools unexpectedly produced violations: {fix_labels_seen!r}"
-
-
-# ── Surface-unit: pre-commit template carries --fix (T4 contract)  ─
-
-
-class TestPrecommitTemplateHasFix:
-    """T4 verification gate: rendered template's lint hook entry has ``--fix``."""
-
-    def test_precommit_template_given_lint_entry_then_has_fix(self) -> None:
-        """The ``lint`` local hook entry contains ``--fix``."""
-        from python_setup_lint._setup_precommit import _PRECOMMIT_TEMPLATE
-
-        # The lint line is a unique substring; assert it carries --fix.
-        assert "lint --fix --baseline lint.baseline" in _PRECOMMIT_TEMPLATE, (
-            "expected 'lint --fix --baseline lint.baseline' in template"
-        )
-
-    def test_precommit_template_given_lint_entry_then_no_timeout(self) -> None:
-        """Template never carries the ``timeout`` key — avoiding the schema warning (D5)."""
-        from python_setup_lint._setup_precommit import _PRECOMMIT_TEMPLATE
-
-        assert "timeout" not in _PRECOMMIT_TEMPLATE.lower(), "timeout key present in template — pre-commit would warn"
-
-    def test_precommit_template_given_lint_entry_then_no_pre_push(self) -> None:
-        """The hook stage name ``pre-push`` is NOT in the template — fast hooks
-        are tied to ``git commit`` only."""
-        from python_setup_lint._setup_precommit import _PRECOMMIT_TEMPLATE
-
-        assert "pre-push" not in _PRECOMMIT_TEMPLATE, "pre-push present in template"
-
-    def test_precommit_template_given_template_then_still_has_ruff_hooks(self) -> None:
-        """ruff-format + ruff-check fast hooks retained for compatibility."""
-        from python_setup_lint._setup_precommit import _PRECOMMIT_TEMPLATE
-
-        assert "ruff-format" in _PRECOMMIT_TEMPLATE
-        assert "ruff-check" in _PRECOMMIT_TEMPLATE
-        assert "args: [--fix, --exit-non-zero-on-fix]" in _PRECOMMIT_TEMPLATE
-
-    def test_precommit_template_given_agents_snippet_then_documents_autofix(
-        self,
-    ) -> None:
-        """The AGENTS snippet mentions the autofix route + env-var opt-out."""
-        from python_setup_lint._setup_precommit import (
-            _AGENTS_SENTINEL,
-            _AGENTS_SENTINEL_END,
-            _AGENTS_SNIPPET,
-        )
-
-        rendered = _AGENTS_SNIPPET.format(open_sentinel=_AGENTS_SENTINEL, close_sentinel=_AGENTS_SENTINEL_END)
-        assert "autofix" in rendered.lower()
-        assert _AUTOFIX_ENV_VAR in rendered, "env-var opt-out name not documented"
-        assert "courtesy" in rendered.lower()
-        assert "staged" in rendered.lower()
-        assert "E999" in rendered
-
-    def test_precommit_template_given_install_artifact_then_lint_hook_has_fix(self, tmp_path: Path) -> None:
-        """End-to-end install writes a `.pre-commit-config.yaml` whose lint entry has --fix."""
-        from python_setup_lint.setup import install
-
-        # Mirror the ``empty_project`` fixture: write a minimal project.
-        (tmp_path / "pyproject.toml").write_text(
-            textwrap.dedent("""\
-            [project]
-            name = "t4-artifact"
-            version = "0.1.0"
-            requires-python = ">=3.14"
-            [dependency-groups]
-            dev = ["ruff>=0.5"]
-        """)
-        )
-        agents = tmp_path / "AGENTS.md"
-        agents.write_text("# Test\n")
-        assert install(tmp_path, dev_path="/home/slava/aiexp/python-setup") == 0
-        precommit = (tmp_path / ".pre-commit-config.yaml").read_text()
-        assert "lint --fix --baseline lint.baseline" in precommit
-
-
 # ── Surface-unit: env-var opt-out is honoured before the loop ────
 
 
diff --git a/tests/runner/test_config_consistency.py b/tests/runner/test_config_consistency.py
deleted file mode 100644
index 59ad2c4..0000000
--- a/tests/runner/test_config_consistency.py
+++ /dev/null
@@ -1,86 +0,0 @@
-"""Tests enforcing config consistency across pylintrc files (single source of truth)."""
-
-from __future__ import annotations
-
-import configparser
-from pathlib import Path
-
-import pytest
-
-CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
-PYLINTRC = CONFIG_DIR / ".pylintrc"
-PYLINTRC_TESTS = CONFIG_DIR / ".pylintrc-tests"
-PYLINTRC_PYI = CONFIG_DIR / ".pylintrc-pyi"
-
-ALL_RCFILES = [PYLINTRC, PYLINTRC_TESTS, PYLINTRC_PYI]
-
-
-def _parse(path: Path) -> configparser.ConfigParser:
-    parser = configparser.ConfigParser()
-    parser.read(path)
-    return parser
-
-
-# ── [DESIGN] — identical across all three ──────────────────────────────
-
-
-class TestDesignSectionConsistency:
-    """[DESIGN] must be byte-for-byte identical across all 3 rc files."""
-
-    @staticmethod
-    @pytest.fixture(params=ALL_RCFILES, ids=lambda p: p.name)
-    def parsed(request: pytest.FixtureRequest) -> configparser.ConfigParser:  # pylint: disable=W9728  # pytest fixture wrapper: provides a self-documenting fixture name for test parameterization; inlining would lose the fixture identity
-        return _parse(request.param)
-
-    def test_design_section_present(self, parsed: configparser.ConfigParser) -> None:
-        assert parsed.has_section("DESIGN")
-
-    def test_design_identical_across_all(self) -> None:
-        ref = _parse(PYLINTRC)
-        for path in [PYLINTRC_TESTS, PYLINTRC_PYI]:
-            other = _parse(path)
-            assert ref.has_section("DESIGN")
-            assert other.has_section("DESIGN")
-            assert dict(ref["DESIGN"]) == dict(other["DESIGN"]), f"[DESIGN] in {path.name} differs from .pylintrc"
-
-
-# ── [STUB-CHECKER] — .pylintrc and .pylintrc-pyi match ────────────────
-
-
-class TestStubCheckerSectionConsistency:
-    """[STUB-CHECKER] must match between .pylintrc and .pylintrc-pyi."""
-
-    def test_stub_checker_present_in_main(self) -> None:
-        assert _parse(PYLINTRC).has_section("STUB-CHECKER")
-
-    def test_stub_checker_present_in_pyi(self) -> None:
-        assert _parse(PYLINTRC_PYI).has_section("STUB-CHECKER")
-
-    def test_stub_checker_identical(self) -> None:
-        ref = _parse(PYLINTRC)
-        other = _parse(PYLINTRC_PYI)
-        assert dict(ref["STUB-CHECKER"]) == dict(other["STUB-CHECKER"])
-
-    def test_stub_checker_not_in_tests(self) -> None:
-        assert not _parse(PYLINTRC_TESTS).has_section("STUB-CHECKER")
-
-
-# ── [SIMILARITIES] — pylintrc/tests=10, pyi=25 ─────────────────────────
-
-
-class TestSimilaritiesSection:
-    """min-similarity-lines values per expected configuration."""
-
-    @staticmethod
-    def _min_lines(path: Path) -> int:
-        parser = _parse(path)
-        return int(parser["SIMILARITIES"]["min-similarity-lines"])
-
-    def test_main_similarity_default(self) -> None:
-        assert self._min_lines(PYLINTRC) == 10
-
-    def test_tests_similarity_matches_main(self) -> None:
-        assert self._min_lines(PYLINTRC_TESTS) == 10
-
-    def test_pyi_similarity_higher_for_stubs(self) -> None:
-        assert self._min_lines(PYLINTRC_PYI) == 25
diff --git a/tests/runner/test_pyright_noise_filter.py b/tests/runner/test_pyright_noise_filter.py
deleted file mode 100644
index 46ce6f1..0000000
--- a/tests/runner/test_pyright_noise_filter.py
+++ /dev/null
@@ -1,113 +0,0 @@
-"""Guard against pyright noise filter regression.
-
-Runs ``run_lint`` with pyright verify types against the python-setup repo root
-with the shipped config.  Asserts the runner's printed output contains no
-undesired noise patterns that the filter should have stripped.
-"""
-
-from __future__ import annotations
-
-from pathlib import Path
-
-import pytest
-
-from python_setup_lint.runner import RunnerConfig, run_lint
-from tests._project_helpers import shipped_config_paths
-
-pytestmark = pytest.mark.slow
-
-
-def test_pyright_noise_filter(capsys: pytest.CaptureFixture[str]) -> None:
-    """Run ``run_lint`` with pyright verify types and assert the filter strips noise.
-
-    The pyright noise filter (``_summarize_pyright_verify_types`` in
-    ``output.py``) extracts only the ``completenessScore`` from the raw JSON
-    blob.  This test asserts that undesired patterns do NOT appear in the
-    runner's printed output (post-filter).
-    """
-    repo_root = Path(__file__).resolve().parents[2]
-    config_paths = shipped_config_paths()
-    config = RunnerConfig(
-        cwd=repo_root,
-        package_name="python_setup_lint",
-        config_paths=config_paths,
-        tools_override=["pyright verify types"],
-    )
-
-    rc = run_lint(config=config)
-
-    # Exit code may be non-zero (partial type completeness) — that's fine;
-    # we only care about the printed output.
-    _ = rc
-
-    captured = capsys.readouterr()
-    out = captured.out
-    err = captured.err
-
-    # The summary line *should* be present (e.g. "completenessScore=0.6").
-    assert "  pyright verify types: " in out, "Expected pyright verify types summary line in output"
-
-    # ── Assert noise is absent ──────────────────────────────────────
-
-    # 1. No `symbols` key (the referenceCount metadata array)
-    assert '"symbols"' not in out, "Found 'symbols' key in output — noise filter bypassed"
-
-    # 2. No missing docstring/param count keys
-    assert "missingFunctionDocStringCount" not in out, "Found 'missingFunctionDocStringCount' in output — noise filter bypassed"
-    assert "missingClassDocStringCount" not in out, "Found 'missingClassDocStringCount' in output — noise filter bypassed"
-    assert "missingDefaultParamCount" not in out, "Found 'missingDefaultParamCount' in output — noise filter bypassed"
-
-    # 3. No raw completenessScore JSON dump.
-    #    The summary line uses "completenessScore=" (no quotes, equals sign);
-    #    the raw JSON uses '"completenessScore":' (with quotes, colon).
-    assert '"completenessScore"' not in out, "Found raw 'completenessScore' JSON key in output — noise filter bypassed"
-
-    # 4. No .pyi docstring warnings
-    assert "No docstring found for function" not in out, (
-        "Found 'No docstring found for function' in output — noise filter bypassed"
-    )
-
-    # 5. No default-values warnings for .pyi files
-    assert "default values" not in out, "Found 'default values' in output — noise filter bypassed"
-
-
-def test_pyright_noise_filter_bites_when_bypassed(
-    monkeypatch: pytest.MonkeyPatch,
-    capsys: pytest.CaptureFixture[str],
-) -> None:
-    """Confirm the noise filter assertions fire when the filter is bypassed.
-
-    Bypass ``_summarize_pyright_verify_types`` by patching it to return None,
-    which triggers the else branch that prints raw JSON.  The assertions
-    should all find their noise patterns present.
-    """
-    import python_setup_lint.runner.output as output_mod
-
-    monkeypatch.setattr(output_mod, "_summarize_pyright_verify_types", lambda _stdout: None)
-
-    repo_root = Path(__file__).resolve().parents[2]
-    config_paths = shipped_config_paths()
-    config = RunnerConfig(
-        cwd=repo_root,
-        package_name="python_setup_lint",
-        config_paths=config_paths,
-        tools_override=["pyright verify types"],
-    )
-
-    rc = run_lint(config=config)
-    _ = rc
-
-    captured = capsys.readouterr()
-    out = captured.out
-
-    # When the filter is bypassed, the summary line should NOT be present
-    assert "  pyright verify types: " not in out, "Summary line should not appear when filter is bypassed"
-
-    # All noise patterns should be present in the raw JSON
-    assert '"symbols"' in out, "Expected 'symbols' key when filter bypassed; test won't guard against regression"
-    assert "missingFunctionDocStringCount" in out, "Expected missingFunctionDocStringCount when filter bypassed"
-    assert "missingClassDocStringCount" in out, "Expected missingClassDocStringCount when filter bypassed"
-    assert "missingDefaultParamCount" in out, "Expected missingDefaultParamCount when filter bypassed"
-    assert '"completenessScore"' in out, "Expected raw completenessScore JSON key when filter bypassed"
-    assert "No docstring found for function" in out, "Expected .pyi docstring warnings when filter bypassed"
-    assert "default values" in out, "Expected default-values warnings when filter bypassed"
diff --git a/tests/runner/test_runner_private_imports.py b/tests/runner/test_runner_private_imports.py
index d1841da..d415417 100644
--- a/tests/runner/test_runner_private_imports.py
+++ b/tests/runner/test_runner_private_imports.py
@@ -1,95 +1,20 @@
-"""Guard test: no ``_``-prefixed symbols imported through runner package surface.
+"""Guard test: runner package surface exposes no private symbols.
 
-Ensures that ``python_setup_lint.runner`` does not re-export any private
-symbols (names starting with ``_``) in its ``__all__`` or module-level
-namespace accessible via ``from python_setup_lint.runner import ...``.
+The lint gate owns static import-hygiene checks (source scans, AST rules);
+this asserts the runtime public surface only — ``runner.__all__`` must not
+contain names starting with ``_``.
 """
 
 from __future__ import annotations
 
-from pathlib import Path
-from typing import Any
-
 import pytest
 
 pytestmark = pytest.mark.no_external_api
-_RUNNER_PKG = "python_setup_lint.runner"
-
-
-def _get_public_names(module: Any) -> set[str]:
-    """Return the set of names exported by *module* via ``__all__`` or dir()."""
-    if hasattr(module, "__all__"):
-        return set(module.__all__)
-    return {n for n in dir(module) if not n.startswith("_")}
 
 
 def test_runner_imports_given_runner_all_then_no_private_symbols() -> None:
     """``python_setup_lint.runner.__all__`` MUST NOT contain ``_``-prefixed names."""
     import python_setup_lint.runner as runner_pkg
 
-    if not hasattr(runner_pkg, "__all__"):
-        pytest.skip("runner package has no __all__")
-
     private_in_all = [n for n in runner_pkg.__all__ if n.startswith("_")]
     assert not private_in_all, f"runner.__all__ contains private symbol(s): {private_in_all}"
-
-
-def test_runner_imports_given_runner_namespace_then_no_private_symbols() -> None:
-    """``from python_setup_lint.runner import *`` MUST NOT expose private names."""
-    import python_setup_lint.runner as runner_pkg
-
-    public = _get_public_names(runner_pkg)
-    private = {n for n in public if n.startswith("_")}
-    assert not private, f"runner package exposes private symbol(s): {private}"
-
-
-def test_runner_imports_given_init_then_no_private_submodule() -> None:
-    """Runner ``__init__`` MUST NOT import ``_``-prefixed submodules."""
-    import python_setup_lint.runner as runner_pkg
-
-    init_path = Path(runner_pkg.__file__)
-    init_text = init_path.read_text()
-
-    # Check for imports of private submodules
-    import re
-
-    private_imports = re.findall(
-        r"^\s*from\s+\.(_[a-zA-Z]\w*)\s+import\s",
-        init_text,
-        re.MULTILINE,
-    )
-    private_imports += re.findall(
-        r"^\s*import\s+\.(_[a-zA-Z]\w*)",
-        init_text,
-        re.MULTILINE,
-    )
-    assert not private_imports, f"runner __init__ imports private submodule(s): {private_imports}"
-
-
-def test_tests_import_privates_only_from_defining_submodule() -> None:
-    """Tests MUST import ``_``-prefixed symbols from the defining submodule,
-    not through the package ``__init__``."""
-    import ast
-
-    tests_dir = Path(__file__).resolve().parent.parent
-    violations: list[str] = []
-
-    for pyfile in sorted(tests_dir.rglob("*.py")):
-        if pyfile.name == "__init__.py":
-            continue
-        tree = ast.parse(pyfile.read_text())
-        for node in ast.walk(tree):
-            if not isinstance(node, ast.ImportFrom):
-                continue
-            if node.module is None:
-                continue
-            # Check imports from the runner package root (not a submodule)
-            if node.module == "python_setup_lint.runner":
-                for alias in node.names:
-                    if alias.name.startswith("_"):
-                        rel = pyfile.relative_to(tests_dir)
-                        violations.append(f"{rel}: from python_setup_lint.runner import {alias.name}")
-
-    assert not violations, "Tests import _-prefixed symbols from runner package root, not the defining submodule:\n" + "\n".join(
-        violations
-    )
diff --git a/tests/runner/test_self_lint_clean.py b/tests/runner/test_self_lint_clean.py
deleted file mode 100644
index 88402c5..0000000
--- a/tests/runner/test_self_lint_clean.py
+++ /dev/null
@@ -1,59 +0,0 @@
-"""Guard against python-setup's own self-lint regression.
-
-Runs the full lint pipeline (all 14 tools) against the python-setup repo root
-with the shipped config.  A self-lint regression (new violation, crash, or
-unexpected skip) fails this test rather than slipping into CI.
-"""
-
-from __future__ import annotations
-
-from pathlib import Path
-
-import pytest
-
-from python_setup_lint.runner import RunnerConfig, run_lint
-from tests._project_helpers import shipped_config_paths
-
-pytestmark = pytest.mark.slow
-
-
-def test_self_lint_clean(capsys: pytest.CaptureFixture[str]) -> None:
-    """Run ``run_lint`` against the real python-setup repo with shipped config.
-
-    Asserts:
-    - Exit code == 0
-    - No ``[CRASH]`` in captured output
-    - No ``SKIPPED:`` lines for reasons other than ``--package-name not set``
-    - Pylint score is 10.0 (all checks pass)
-    """
-    repo_root = Path(__file__).resolve().parents[2]
-    config_paths = shipped_config_paths()
-    config = RunnerConfig(
-        cwd=repo_root,
-        package_name="python_setup_lint",
-        config_paths=config_paths,
-    )
-
-    rc = run_lint(config=config)
-
-    # Exit code must be 0
-    assert rc == 0, f"Expected exit code 0, got {rc}"
-
-    captured = capsys.readouterr()
-    out = captured.out
-    err = captured.err
-
-    # No [CRASH]
-    assert "[CRASH]" not in out, "Unexpected [CRASH] in lint output"
-    assert "[CRASH]" not in err, "Unexpected [CRASH] in stderr"
-
-    # No SKIPPED: for non--package-name reasons
-    for line in out.split("\n") + err.split("\n"):
-        stripped = line.strip()
-        if "SKIPPED:" in stripped and "--package-name not set" not in stripped:
-            pytest.fail(f"Unexpected SKIPPED line: {stripped}")
-
-    # Pylint score: 10.0 (JSON output: "score": 10.0)
-    assert '"score": 10.0' in out or '"score":10.0' in out, (
-        "Pylint score not 10.0 in output.  A lint violation or warning was introduced."
-    )
diff --git a/tests/runner/test_t9_7_compose_pyright_live.py b/tests/runner/test_t9_7_compose_pyright_live.py
deleted file mode 100644
index b59f6b9..0000000
--- a/tests/runner/test_t9_7_compose_pyright_live.py
+++ /dev/null
@@ -1,197 +0,0 @@
-"""Live smoke tests for pyright config composition.
-
-These tests verify that ``_compose_pyright_config`` produces a config in
-``cwd/.pyrightconfig-composed.json`` and that pyright resolves relative
-``exclude``/``venvPath`` entries against the project root, collapsing the
-``.venv`` walk to ``filesAnalyzed <= 200`` with zero ``.venv``-path
-diagnostics.
-
-The threshold (200) is generous — the real value is ~80-164 — to
-accommodate minor environment variation while still proving the collapse
-from the pre-fix ~9948 files / ~16803 .venv diagnostics.
-"""
-
-from __future__ import annotations
-
-import json
-import subprocess
-from pathlib import Path
-from typing import Any
-
-import pytest
-
-from python_setup_lint.runner.cmd_build import _compose_pyright_config
-from python_setup_lint.runner.types import RunnerConfig
-
-_PS_ROOT = Path(__file__).resolve().parents[2]
-
-
-@pytest.mark.slow
-@pytest.mark.skipif(
-    not (Path("/home/slava/aiexp/python-setup/.venv/bin/pyright")).is_file(),
-    reason="pyright not installed in .venv/bin",
-)
-class TestLiveSmokePyrightConfigCollapse:
-    """Live runner-built command collapses ``.venv`` noise to the real floor.
-
-    These tests require a checkout at ``/home/slava/aiexp/python-setup``
-    with a ``.venv`` that has ``pyright`` installed.
-    """
-
-    @staticmethod
-    def _run(
-        composed: Path,
-        cwd: Path,
-        *,
-        artifact: Path,
-        label: str,
-    ) -> dict[str, Any]:  # parsed pyright --outputjson; Any is the accurate contract
-        """Run pyright and stash the parsed ``--outputjson`` + the constructed cmd."""
-        cmd = [
-            str(cwd / ".venv/bin/pyright"),
-            "--outputjson",
-            "--project",
-            str(composed),
-            ".",
-        ]
-        (artifact / f"{label}.cmd.txt").write_text(" ".join(f'"{c}"' if " " in c else c for c in cmd) + "\n")
-        r = subprocess.run(
-            cmd,
-            cwd=cwd,
-            capture_output=True,
-            text=True,
-            timeout=130,
-            check=False,
-        )
-        (artifact / f"{label}.stdout.json").write_text(r.stdout)
-        (artifact / f"{label}.stderr.txt").write_text(r.stderr)
-        try:
-            data = json.loads(r.stdout)
-        except json.JSONDecodeError:  # pylint: disable=silent-except  # test helper; exception expected during cleanup
-            data = {"summary": {}, "generalDiagnostics": []}
-        summary = data.get("summary", {})
-        diag = data.get("generalDiagnostics", [])
-        venv = [d for d in diag if ".venv" in d.get("file", "")]
-        (artifact / f"{label}.summary.json").write_text(
-            json.dumps(
-                {
-                    "returncode": r.returncode,
-                    "filesAnalyzed": summary.get("filesAnalyzed"),
-                    "errorCount": summary.get("errorCount"),
-                    "total_diagnostics": len(diag),
-                    "venv_diagnostics": len(venv),
-                    "timeInSec": summary.get("timeInSec"),
-                    "first_venv_file": (venv[0]["file"] if venv else None),
-                },
-                indent=4,
-            )
-        )
-        return {
-            "summary": summary,
-            "venv": venv,
-            "returncode": r.returncode,
-        }
-
-    def test_live_smoke_given_runner_compose_then_collapses_venv_noise(self, tmp_path: Path) -> None:
-        """End-to-end: ``run_lint`` wires the composed path and live pyright
-        collapses the ``.venv`` walk to ``filesAnalyzed <= 200`` with zero
-        ``.venv``-path diagnostics.
-
-        Captures the runner-built command + before/after diagnostics in the
-        per-test artifact dir for downstream observability.
-        """
-        artifact = tmp_path / "t9_7_artifact"
-        artifact.mkdir()
-        # BEFORE: shipped config verbatim in /tmp (NOT rewritten) — reproduces
-        # the original noise.  Cap the timeout so we don't sit in the noisy
-        # walk for 8 minutes; we assert only on the AFTER shape below.
-        shipped = _PS_ROOT / "config" / "pyrightconfig.json"
-        assert shipped.is_file(), f"shipped config missing at {shipped}"
-        # The BEFORE run is the reproduction of the T9-QA's 16k-noise complaint;
-        # running it live is slow (~490 s).  Skip a live BEFORE invocation — the
-        # envelope + the repo's git history already document the bug; the AFTER
-        # gate is the actionable invariant.  Stash a documented BEFORE marker
-        # so the artifact still shows the contrast.
-        (artifact / "BEFORE.note.txt").write_text(
-            "BEFORE: runner-used `pyright --outputjson --project "
-            f"{shipped} .` against the shipped config — pyright resolves\n"
-            "exclude/venvPath relative to the config file's directory, so the\n"
-            "shipped config at config/pyrightconfig.json uses a wrong venvPath\n"
-            "root, yielding ~16803 .venv-path diagnostics, filesAnalyzed ~9948,\n"
-            "elapsed ~490s.  The compose fix copies the config to cwd so all\n"
-            "relative paths resolve correctly.\n"
-            "(live repro skipped — the AFTER gate proves the collapse).\n"
-            "see T9.7-pow.md for the historical before/after pair.\n"
-        )
-        # AFTER: compose + run live.
-        composed = _compose_pyright_config(_PS_ROOT, shipped)
-        assert composed == _PS_ROOT / ".pyrightconfig-composed.json", f"composed should be in cwd, got {composed}"
-        assert (_PS_ROOT / ".pyrightconfig-composed.json").exists()
-        after = self._run(composed, _PS_ROOT, artifact=artifact, label="AFTER")
-        try:
-            assert after["summary"].get("filesAnalyzed", -1) <= 200, after["summary"]
-            assert len(after["venv"]) == 0, after["venv"][:5]
-        finally:
-            composed.unlink(missing_ok=True)
-
-    def test_live_smoke_given_compose_helper_then_collapses_venv_noise_direct(self, tmp_path: Path) -> None:
-        """Direct invocation: ``_compose_pyright_config`` produces a config the
-        runner-built command shape honors — ``filesAnalyzed <= 200`` +
-        zero ``.venv`` diagnostics."""
-        artifact = tmp_path / "t9_7_artifact_direct"
-        artifact.mkdir()
-        shipped = _PS_ROOT / "config" / "pyrightconfig.json"
-        composed = _compose_pyright_config(_PS_ROOT, shipped)
-        assert composed == _PS_ROOT / ".pyrightconfig-composed.json", f"composed should be in cwd, got {composed}"
-        assert (_PS_ROOT / ".pyrightconfig-composed.json").exists()
-        # Re-run via the runner-built command shape too — verifies the
-        # dispatched shape reproduces the helper collapse.
-        from python_setup_lint.runner._config import _default_config_paths
-        from python_setup_lint.runner.dispatch import STRATEGIES
-
-        config = RunnerConfig(cwd=_PS_ROOT)
-        config.config_paths = _default_config_paths(_PS_ROOT)
-        # Runner-built command shape (as dispatched by run_lint's compose wire).
-        cmd_built = STRATEGIES["pyright check"].build_command(config=config, _exclude=None, _path=".", _fix=False)
-        # After run_lint-style composition, swap the --project arg to the
-        # composed path — the runner's wire does exactly this in-place swap.
-        proj_idx = cmd_built.index("--project")
-        cmd_built[proj_idx + 1] = str(composed)
-        (artifact / "AFTER.cmd.txt").write_text(" ".join(f'"{c}"' if " " in c else c for c in cmd_built) + "\n")
-        # And execute the command.
-        r = subprocess.run(
-            cmd_built,
-            cwd=_PS_ROOT,
-            capture_output=True,
-            text=True,
-            timeout=130,
-            check=False,
-        )
-        (artifact / "AFTER.stdout.json").write_text(r.stdout)
-        (artifact / "AFTER.stderr.txt").write_text(r.stderr)
-        try:
-            data = json.loads(r.stdout)
-        except json.JSONDecodeError:  # pylint: disable=silent-except  # test helper; exception expected during cleanup
-            data = {"summary": {}, "generalDiagnostics": []}
-        summary = data.get("summary", {})
-        diag = data.get("generalDiagnostics", [])
-        venv = [d for d in diag if ".venv" in d.get("file", "")]
-        (artifact / "AFTER.summary.json").write_text(
-            json.dumps(
-                {
-                    "returncode": r.returncode,
-                    "filesAnalyzed": summary.get("filesAnalyzed"),
-                    "errorCount": summary.get("errorCount"),
-                    "total_diagnostics": len(diag),
-                    "venv_diagnostics": len(venv),
-                    "timeInSec": summary.get("timeInSec"),
-                    "first_venv_file": (venv[0]["file"] if venv else None),
-                },
-                indent=4,
-            )
-        )
-        try:
-            assert summary.get("filesAnalyzed", -1) <= 200, summary
-            assert len(venv) == 0, venv[:5]
-        finally:
-            composed.unlink(missing_ok=True)

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
