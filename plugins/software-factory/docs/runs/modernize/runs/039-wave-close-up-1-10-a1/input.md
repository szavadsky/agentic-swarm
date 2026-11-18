# Step: Wave Close-Up

## Goal
Verify repository integrity and cleanliness on the merged task branch after all wave items finish. Audit gates against baseline and compile the wave outcome.

## Rules
- Tree hygiene: check for stray untracked junk, leftover temporary artifacts, or lingering merge conflict markers.
- Gate baseline: the engine ran all infra gates on the merged branch; judge regressions ONLY from the `Gate Diff (baseline vs now)` table below. Gates that were green at baseline must remain green; report any regressions in `failedItems`/`blockedItems` and the summary.
- No raw-text comparison: never infer fixes or regressions by comparing raw gate output text (timing, ordering, and truncation differ run to run). A gate counts as fixed ONLY when its table row shows now=pass after baseline=fail.
- Outcome compilation: yield the wave outcome matching `wave-closeup.schema.json`.
- Status semantics: `complete` (all items merged, tree clean, gates green), `has_failures` (some items failed but iteration can continue), `blocked` (wave cannot proceed without operator input).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

## Task & Wave
Task: modernize
Wave Report: Wave 10 completed. Merged items:  Blocked-by-failure items: test-debloat-audit-v2

## Infrastructure Gates
setup:
  - uv sync
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
  - id: test
    command: uv run pytest -q
  - id: test-integration
    command: uv run pytest tests/integration.py -q
testRunner:
  command: uv run pytest
  selectorArgs:
    - -k
  junitArg: --junitxml={path}
notes:
  - "CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff
    format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by
    cmd_build._build_command) runs plain `ruff format` with neither `--check`
    nor `--config`, so every invocation silently rewrites 105 files using ruff's
    default line-length instead of config/ruff.toml. Verified live (worktree
    went dirty with 106 modified files, then reverted; final state clean).
    Declared gates therefore split it: `format` = `ruff format --check --config
    config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the
    runner with the 13 check-only tools (mutation-free, verified clean
    afterwards). Operator action: add `--check` (+ `--config`) to the `ruff
    format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run
    lint` stops mutating worktrees."
  - "Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6
    failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume
    13 tools while TOOLS now has 14 (`ruff format` added):
    test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_pr\
    esent, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates,
    test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_cov\
    ered,
    test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given\
    _all_tools_then_have_parser,
    test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_t\
    ools_dispatched], ::[package_name_none_skips_stubtest_verifytypes]."
  - "Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at
    src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi
    W9704 unjustified-suppression at
    src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40
    and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at
    src/python_setup_lint/runner/cli.py:50; pylint tests C0208
    use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All
    other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright
    check, pyright verify types, detect-secrets)."
  - "Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked
    slow)."
  - 'Orchestration-folder noise: none — .factory is already excluded by project
    configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach
    exclude "**/.factory"); namespaced --tools list is required because `lint
    --exclude` is only forwarded to tools declaring supports_exclude
    (yamllint/mypy would still scan it). Note the `lint --tools` list must be
    updated if tool names change (unknown names fail loudly with
    ExtraToolsConfigError).'
  - lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves
    identically to plain mode; the pre-commit hook runs `lint --fix --baseline
    lint.baseline` (autofix is courtesy, opt out via
    PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a
    gate.
  - "Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with
    all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv`
    are gitignored build artifacts, so gate runs leave tracked files untouched.
    Test runner selector/junit verified: `uv run pytest -q -k <name>
    --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the
    currently-failing test."


# Infra Operator Action Notes
- CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by cmd_build._build_command) runs plain `ruff format` with neither `--check` nor `--config`, so every invocation silently rewrites 105 files using ruff's default line-length instead of config/ruff.toml. Verified live (worktree went dirty with 106 modified files, then reverted; final state clean). Declared gates therefore split it: `format` = `ruff format --check --config config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the runner with the 13 check-only tools (mutation-free, verified clean afterwards). Operator action: add `--check` (+ `--config`) to the `ruff format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run lint` stops mutating worktrees.
- Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6 failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume 13 tools while TOOLS now has 14 (`ruff format` added): test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_present, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered, test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser, test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], ::[package_name_none_skips_stubtest_verifytypes].
- Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi W9704 unjustified-suppression at src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40 and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at src/python_setup_lint/runner/cli.py:50; pylint tests C0208 use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, detect-secrets).
- Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked slow).
- Orchestration-folder noise: none — .factory is already excluded by project configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach exclude "**/.factory"); namespaced --tools list is required because `lint --exclude` is only forwarded to tools declaring supports_exclude (yamllint/mypy would still scan it). Note the `lint --tools` list must be updated if tool names change (unknown names fail loudly with ExtraToolsConfigError).
- lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves identically to plain mode; the pre-commit hook runs `lint --fix --baseline lint.baseline` (autofix is courtesy, opt out via PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a gate.
- Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv` are gitignored build artifacts, so gate runs leave tracked files untouched. Test runner selector/junit verified: `uv run pytest -q -k <name> --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the currently-failing test.

# Gates Baseline
timestamp: 2026-11-07T19:11:42.005Z
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
    status: pass
    durationMs: 154
    details: 173 files already formatted
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
    status: fail
    durationMs: 121850
    details: >-
      ============================================================

      [tach check] PASSED [0.3s]

      ============================================================

      Configuration

      [WARN] Warning: No first-party imports were found. You may need to use
      'tach mod' to update your Python source roots. Docs:
      https://docs.gauge.sh/usage/configuration#source-roots

      ✅ All modules validated!


      ============================================================

      [ruff check] FAILED (exit=1) [0.0s]

      ============================================================

      src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single
      `if` statement instead of nested `if` statements

      Found 1 error.

      No fixes available (1 hidden fix can be enabled with the `--unsafe-fixes`
      option).


      ============================================================

      [rumdl check] PASSED [0.0s]

      ============================================================


      Success: No issues found in 16 files (14ms)


      ============================================================

      [mypy] PASSED [5.7s]

      ============================================================

      Success: no issues found in 56 source files


      ============================================================

      [yamllint] PASSED [0.2s]

      ============================================================


      =================================================

      ... [truncated 1956 bytes] ...


      ============================================================

      [pylint-pyi] FAILED (exit=8) [9.4s]

      ============================================================

      ************* Module python_setup_lint.runner.cli

      src/python_setup_lint/runner/cli.py:50:0: R0914: Too many local variables
      (23/20) (too-many-locals)


      --------------------------------------------------------------------

      Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)



      ============================================================

      [pylint tests] FAILED (exit=16) [13.8s]

      ============================================================

      {
          "messages": [
              {
                  "type": "convention",
                  "symbol": "use-sequence-for-iteration",
                  "message": "Use a sequence type when iterating over values",
                  "messageId": "C0208",
                  "confidence": "HIGH",
                  "module": "tests.runner._factories_extras",
                  "obj": "<lambda>",
                  "line": 383,
                  "column": 82,
                  "endLine": 383,
                  "endColumn": 123,
                  "path": "tests/runner/_factories_extras.py",
                  "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize/tests/runner/_factories_extras.py"
              }
          ],
          "statistics": {
              "messageTypeCount": {
                  "fatal": 0,
                  "error": 0,
                  "warning": 0,
                  "refactor": 0,
                  "convention": 1,
                  "info": 0
              },
              "modulesLinted": 67,
              "score": 9.99827198894073
          }
      }


      ============================================================

      [detect-secrets] PASSED [7.7s]

      ============================================================


      [pylint] Using rcfile:
      /home/slava/aiexp/python-setup.factory-wt/topic_modernize/config/.pylintrc
  - id: test
    command: uv run pytest -q
    status: fail
    durationMs: 62789
    details: >-
      [Tach] 1328 tests in 54 files unaffected by changes (~29.4s could be
      saved). Skip with: pytest --tach

      [Tach] To disable: pytest -p no:tach
      (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)

      ........................................................................
      [  5%]

      ........................................................................ [
      10%]

      ..............................................................ssss...... [
      16%]

      ........................................................................ [
      21%]

      ........................................................................ [
      27%]

      ........................................................................ [
      32%]

      ........................................................................ [
      38%]

      ........................................................................ [
      43%]

      ........................................................................ [
      49%]

      ........................................................................ [
      54%]

      ........................................................................ [
      60%]

      ...........................................................FF........... [
      65%]

      ........................................................................ [
      71%]

      ..............................................................F......... [
      76%]

      ..

      ... [truncated 17052 bytes] ...

      6 failed, 1300 passed, 4 skipped, 18 deselected, 4 warnings in 26.01s
    failingTests:
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
      - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
      - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched]
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
  - id: test-integration
    command: uv run pytest tests/integration.py -q
    status: pass
    durationMs: 36532
    details: |-
      [Tach] 9 tests in 3 files unaffected by changes (~42.4s could be saved). Skip with: pytest --tach
      [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
      .........                                                                [100%]
      9 passed in 35.70s

## Gate Diff (baseline vs now)
| gate | baseline | now | verdict |
| --- | --- | --- | --- |
| format | pass | pass | green (matches baseline) |
| lint | fail | fail | still failing (matches baseline; not a regression) |
| test | fail | fail | still failing (matches baseline; not a regression) |
| test-integration | pass | pass | green (matches baseline) |

Judge regressions ONLY from this table: a gate counts as fixed only when its row shows now=pass after baseline=fail. Raw output text may differ for unrelated reasons (timing, ordering, truncation) — never infer fixes from text comparison.

## Output

Yield a structured JSON object matching this schema:
- wave (integer, required, min: 1)
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","has_failures","blocked"])
- mergedItems (array of string, required)
- failedItems (array of string, optional)
- blockedItems (array of string, optional)
- debt (array of string, optional)
- summary (string, required)
- recommendations (array of string, optional)
