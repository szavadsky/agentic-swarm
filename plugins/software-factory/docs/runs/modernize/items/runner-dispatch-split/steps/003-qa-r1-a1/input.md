# Step: QA

## Goal
Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.

## Rules
- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
- Story kind validation:
  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

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
  "slug": "runner-dispatch-split",
  "kind": "no-behavior",
  "title": "Split dispatch registry below limits",
  "assignment": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
  "outlineRef": "runner-dispatch-split",
  "milestone": "M3",
  "wave": 3,
  "deps": [
    "runner-compat-shim-removal"
  ],
  "scenarioRefs": [
    "M3: Runner split without drift"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159"
  ],
  "escalate": true
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..e7fab77
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,210 @@
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
+        durationMs: 206
+        details: 194 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 57433
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.2s]
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
+          Success: No issues found in 29 files (15ms)
+
+          ============================================================
+          [mypy] PASSED [5.0s]
+          ============================================================
+          Success: no issues found in 58 source files
+
+          ============================================================
+          [yamllint] PASSED [0.1s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.2s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [7.1s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [4.0s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794203199876",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 114,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 3.603
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.0s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [9.0s]
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
+          [pylint-pyi] PASSED [9.1s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [15.4s]
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
+          [detect-secrets] PASSED [5.8s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 27153
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~29.9s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 25.39s
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
+        durationMs: 58187
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 17s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 57.32s
+  - id: size
+    status: fail
+    message: Production changes (962 lines) exceeded limit (300 lines) for kind
+      no-behavior
+    details:
+      changedLines:
+        added: 543
+        deleted: 419
+        total: 962
+        files:
+          - src/python_setup_lint/runner/dispatch.py
+          - src/python_setup_lint/runner/dispatch.pyi
+          - src/python_setup_lint/runner/_strategies.py
+          - src/python_setup_lint/runner/_strategies.pyi
+      limit: 300
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..fc4b5d1
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,62 @@
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
+  "slug": "runner-dispatch-split",
+  "kind": "no-behavior",
+  "title": "Split dispatch registry below limits",
+  "assignment": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
+  "outlineRef": "runner-dispatch-split",
+  "milestone": "M3",
+  "wave": 3,
+  "deps": [
+    "runner-compat-shim-removal"
+  ],
+  "scenarioRefs": [
+    "M3: Runner split without drift"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159"
+  ],
+  "escalate": true
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "CodingRules.md:90-107",
+  "CodingRules.md:139-159"
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
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..c9c46df
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/meta.yaml
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
+status: rejected
+startedAt: 2026-11-09T05:32:26.889Z
+session: 01a1becb-ab1f-7631-bff8-713a9ca16b7d
+endedAt: 2026-11-09T05:48:45.647Z
+usage:
+  inputTokens: 127456
+  outputTokens: 59235
+  costUsd: 0.07537
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T05-33-01-087Z_01a1becb-ab1f-7631-bff8-713a9ca16b7d.jsonl
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..f3903a8
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,80 @@
+status: ok
+summary: "Split runner/dispatch.py (542 lines, too-many-lines disable) into
+  dispatch.py (196-line registry:
+  TOOLS/TOOLS_BY_NAME/sets/LINT_TOOLS/STRATEGIES/register_lint_tool/_strategy_f\
+  or) and new _strategies.py (375 lines: LintTool, GenericLintTool, 7 private
+  strategy subclasses, _STRATEGY_CLASSES); both under the 500-line pylint limit
+  with no disables. Added _strategies.pyi (public surface + private declarations
+  needed by the stub import contract, matching the existing _ast_helpers.pyi
+  precedent), slimmed dispatch.pyi to re-export LintTool/GenericLintTool from
+  ._strategies, and kept runner/__init__.py unchanged so every public name stays
+  single-sourced through dispatch (identical object identity). Removed
+  dispatch.py:1 and test_lint_runner.py:7 stale too-many-lines disables;
+  migrated test_lint_runner.py's hardcoded '== 14' registry assertion to
+  EXPECTED_TOOL_NAMES (fakes/stats/t3 tests already consume EXPECTED/STATISTICS
+  sets). peek_fallback_tools re-export kept because the baseline compat shim
+  still exists at HEAD (baseline.py:20,26). All targets green: owned tests 197
+  passed, full suite 1377 passed/13 deselected, integration incl. byte-identical
+  golden 9 passed, full lint exit 0."
+target:
+  command: uv run pytest tests/runner/test_lint_runner.py
+    tests/runner/test_lint_runner_stats.py tests/runner/test_t3_coverage.py
+    tests/runner/test_testing_fakes.py -q
+  customTarget: true
+evidence:
+  - "Split sizing: wc -l -> dispatch.py 196, _strategies.py 375, both <500; grep
+    -c too-many-lines = 0 in both production files and in
+    tests/runner/test_lint_runner.py (480 lines)."
+  - "AST top-level diff vs git HEAD dispatch.py: no missing definitions and no
+    duplicates; dispatch keeps
+    TOOLS/TOOLS_BY_NAME/EXPECTED_TOOL_NAMES/FORMATTER_ONLY/STATISTICS_PARSER_TO\
+    OLS/RECORD_PARSER_TOOLS/RECORDLESS_TOOLS/STRATEGIES/LINT_TOOLS/_strategy_fo\
+    r/register_lint_tool; _strategies owns LintTool/GenericLintTool/7
+    subclasses/_STRATEGY_CLASSES."
+  - Public-surface script asserted all 12 assigned names exist via
+    python_setup_lint.runner and are the same objects as in dispatch (TOOLS,
+    LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS,
+    STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool,
+    LintTool, register_lint_tool); LINT_TOOLS is the same mutable list, extras
+    append (14->15) and same-name re-registration replaces in place,
+    TOOLS_BY_NAME stays at 14 frozen built-ins -> PUBLIC_SURFACE_OK 14 15.
+  - "Owned target tests: uv run pytest tests/runner/test_lint_runner.py
+    tests/runner/test_lint_runner_stats.py tests/runner/test_t3_coverage.py
+    tests/runner/test_testing_fakes.py -q -> 197 passed."
+  - "Full unit suite: uv run pytest -q -> 1377 passed, 13 deselected, 4 warnings
+    in 35.89s (no new failures)."
+  - "Golden/integration: uv run pytest tests/integration.py -v -> 9 passed,
+    including assert_matches_golden and assert_golden_byte_identical, so golden
+    is hash-equal (no shift report needed)."
+  - "Full project lint gate: uv run lint redirect-captured -> LINT_EXIT=0 with
+    empty lint.baseline (all 14 tools incl. pylint, pylint-pyi, mypy.stubtest,
+    ty check, pyright, tach, detect-secrets passed; no new violations)."
+  - "Format gate: uv run ruff format --config config/ruff.toml --check on
+    dispatch.py, _strategies.py, both stubs, and test_lint_runner.py -> all
+    already formatted; ruff check --config config/ruff.toml -> All checks
+    passed."
+  - "Stub fidelity/import contract: pylint --rcfile=config/.pylintrc on runner
+    package (21 modules) -> 10.00/10, no E97A1/W9700; mypy --config-file
+    config/mypy.ini . -> Success, no issues in 58 files; mypy.stubtest
+    python_setup_lint.runner._strategies/...dispatch -> exit 0."
+  - "Shim retention evidence: baseline.py still defines/re-exports
+    peek_fallback_tools (lines 20 and 26), so the conditional removal of
+    runner/__init__.py doc :17/import :22/__all__ :62 was correctly skipped;
+    runner/__init__.py and __init__.pyi are untouched."
+  - "Scope: git status shows only owned files changed (dispatch.py,
+    dispatch.pyi, test_lint_runner.py modified; _strategies.py, _strategies.pyi
+    new); baseline.py/parsers.py/types.py/_cli_complexity.py/cli.py/tests
+    data/docs untouched."
+concerns:
+  - _strategies.pyi declares the seven private strategy subclasses and
+    _STRATEGY_CLASSES because dispatch.py imports them for its runtime re-export
+    surface and the custom stub checker (E97A1) requires imported symbols to be
+    declared; this mirrors the existing checkers/stub/fidelity/_ast_helpers.pyi
+    precedent, and pylint skips companion stubs so W9707 does not fire.
+  - The ruff format invocation must pass --config config/ruff.toml (project
+    config is not auto-discovered at repo root); running bare ruff format
+    reformats at the 88-column default and creates churn.
+notes: dispatch.pyi now re-exports LintTool/GenericLintTool with redundant 'as'
+  aliases from ._strategies (mypy-safe re-export) and its docstring describes
+  the registry-only surface. No test outside the four enumerated files was
+  modified.
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/checks.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..f51f97c
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/checks.yaml
@@ -0,0 +1,209 @@
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
+        durationMs: 198
+        details: 194 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 57874
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.2s]
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
+          Success: No issues found in 29 files (15ms)
+
+          ============================================================
+          [mypy] PASSED [4.5s]
+          ============================================================
+          Success: no issues found in 58 source files
+
+          ============================================================
+          [yamllint] PASSED [0.1s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.2s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [7.1s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [4.1s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794203795465",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 114,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 3.559
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.0s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [9.2s]
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
+          [pylint-pyi] PASSED [9.0s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [15.5s]
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
+          [detect-secrets] PASSED [6.5s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 31174
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~22.1s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-dispatch-split/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 29.28s
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
+        durationMs: 57223
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~54.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 56.28s
+  - id: size
+    status: pass
+    message: "size passed: 222/300 production lines changed"
+    details:
+      changedLines:
+        added: 120
+        deleted: 102
+        total: 222
+        files:
+          - src/python_setup_lint/runner/dispatch.py
+          - src/python_setup_lint/runner/dispatch.pyi
+          - src/python_setup_lint/runner/_tool_specs.py
+          - src/python_setup_lint/runner/_tool_specs.pyi
+      limit: 300
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/input.md b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/input.md
new file mode 100644
index 0000000..4ede282
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/input.md
@@ -0,0 +1,88 @@
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
+  "slug": "runner-dispatch-split",
+  "kind": "no-behavior",
+  "title": "Split dispatch registry below limits",
+  "assignment": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
+  "outlineRef": "runner-dispatch-split",
+  "milestone": "M3",
+  "wave": 3,
+  "deps": [
+    "runner-compat-shim-removal"
+  ],
+  "scenarioRefs": [
+    "M3: Runner split without drift"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "command": "uv run pytest tests/runner/test_lint_runner.py tests/runner/test_lint_runner_stats.py tests/runner/test_t3_coverage.py tests/runner/test_testing_fakes.py -q",
+  "customTarget": true
+}
+
+## Context & Citations
+[
+  "CodingRules.md:90-107",
+  "CodingRules.md:139-159"
+]
+
+## Review Feedback
+Failing check: size
+
+Message: Production changes (962 lines) exceeded limit (300 lines) for kind no-behavior
+
+Detail:
+{
+  "changedLines": {
+    "added": 543,
+    "deleted": 419,
+    "total": 962,
+    "files": [
+      "src/python_setup_lint/runner/dispatch.py",
+      "src/python_setup_lint/runner/dispatch.pyi",
+      "src/python_setup_lint/runner/_strategies.py",
+      "src/python_setup_lint/runner/_strategies.pyi"
+    ]
+  },
+  "limit": 300
+}
+
+Budget: 962 prod lines changed vs storyMaxProdLines 300 (kind no-behavior). Shrink the diff or escalate; do not re-verify green checks from scratch.
+
+Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.
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
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/meta.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..d3555f8
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T05:48:50.339Z
+session: 01a1beda-2962-76f1-b11c-24d4b910c1ed
+endedAt: 2026-11-09T05:58:45.290Z
+usage:
+  inputTokens: 52246
+  outputTokens: 25047
+  costUsd: 0.027419
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T05-48-50-914Z_01a1beda-2962-76f1-b11c-24d4b910c1ed.jsonl
diff --git a/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/output.yaml b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..ef607ce
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-dispatch-split/steps/002-develop-r1-a2/output.yaml
@@ -0,0 +1,80 @@
+status: ok
+summary: "Replaced the oversized 962-line 3-module split (rejected by the size
+  gate) with a minimal, behavior-preserving single extraction: the 14-entry
+  built-in ToolSpec registry (TOOLS + TOOLS_BY_NAME) now lives in new
+  src/python_setup_lint/runner/_tool_specs.py (+.pyi), and dispatch.py
+  imports/re-exports it. dispatch.py drops 542 → 449 lines so the module-level
+  '# pylint: disable=too-many-lines' at :1 is deleted with no threshold change;
+  _tool_specs.py is 102 lines. All public names (TOOLS, LINT_TOOLS,
+  EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, parser sets,
+  STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool)
+  remain single-sourced through dispatch.py and runner/__init__.py with
+  identical objects and mutation semantics (LINT_TOOLS is still an independent
+  mutable copy of TOOLS; EXPECTED_TOOL_NAMES still derives from TOOLS). Stub
+  files updated with explicit 'as' re-exports. The stale too-many-lines disable
+  in tests/runner/test_lint_runner.py stays removed (file is 480 lines) and its
+  count assertion derives from EXPECTED_TOOL_NAMES. Production diff vs story
+  base: 120 added + 102 deleted = 222 lines (<300)."
+target:
+  command: uv run pytest tests/runner/test_lint_runner.py
+    tests/runner/test_lint_runner_stats.py tests/runner/test_t3_coverage.py
+    tests/runner/test_testing_fakes.py -q
+  customTarget: true
+evidence:
+  - "Size gate: git diff --numstat 5c50e02 -- src/ plus untracked files = 120
+    added / 102 deleted / 222 total prod lines, under the 300-line no-behavior
+    budget (previous attempt was 962)."
+  - "Target command re-run after final edit: 197 passed in 1.47s
+    (tests/runner/test_lint_runner.py, test_lint_runner_stats.py,
+    test_t3_coverage.py, test_testing_fakes.py)."
+  - "Full unit suite: uv run pytest -q -> 1377 passed, 13 deselected, 0 failed
+    in 26.52s (no new failures vs M1 table)."
+  - "Fit-for-purpose integration: uv run pytest tests/integration.py -q -> 9
+    passed in 54.30s."
+  - "Full lint gate: uv run lint -> all 14 tools PASSED (ruff format, ruff
+    check, rumdl, mypy, yamllint, ty check, mypy.stubtest, pyright check,
+    pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets),
+    wall 62.76s; zero new violations vs lint.baseline (lint.baseline has no
+    dispatch.py entries and was not edited)."
+  - "pylint-pyi targeted re-run after removing the impl module docstring: uv run
+    lint --tools pylint-pyi -> PASSED (W9700 docstring-in-impl resolved)."
+  - "Golden tests: uv run pytest tests/test_golden.py -q -> 31 passed."
+  - "Line limits verified: dispatch.py 449, _tool_specs.py 102, dispatch.pyi
+    125, _tool_specs.pyi 13 — all <=500; grep 'too-many-lines' dispatch.py
+    returns none (disable removed, no threshold raised)."
+  - "Registry identity/semantics: runtime check asserts dispatch.TOOLS is
+    _tool_specs.TOOLS, dispatch.TOOLS_BY_NAME is _tool_specs.TOOLS_BY_NAME,
+    runner.TOOLS is _tool_specs.TOOLS, len(TOOLS)==len(LINT_TOOLS)==14,
+    LINT_TOOLS is not TOOLS, set(STRATEGIES)==EXPECTED_TOOL_NAMES,
+    FORMATTER_ONLY=={'ruff format'},
+    RECORDLESS_TOOLS==EXPECTED_TOOL_NAMES-RECORD_PARSER_TOOLS;
+    register_lint_tool append/update behavior exercised by passing
+    test_lint_runner_stats mutation tests."
+  - Single-source invariants preserved in dispatch.py:51 EXPECTED_TOOL_NAMES =
+    frozenset(t.name for t in TOOLS) and :414 LINT_TOOLS = list(TOOLS); TOOLS
+    literal now at _tool_specs.py:9, re-exported as dispatch.TOOLS.
+  - "Shim conditional evidence: src/python_setup_lint/runner/parsers.py still
+    exists (275 lines, re-export layer over _record_parsers/_record_types), so
+    the runner/__init__.py peek lines were intentionally kept (doc :17, 'from
+    .baseline import peek_fallback_tools' :22, __all__ entry :62)."
+  - "Test migration verified: stale '# pylint: disable=too-many-lines' absent
+    from tests/runner/test_lint_runner.py (480 lines) and its tool-count
+    assertion uses EXPECTED_TOOL_NAMES; remaining '14' mentions in tests/runner
+    are docstrings/oracle comments only, no hardcoded count assertions."
+concerns:
+  - The enforced 300-line no-behavior budget makes the assignment's 3-way
+    (registry/strategies/parser-sets) split impossible; only the registry slice
+    was extracted, which satisfies the binding 'dispatch.py <=500, no
+    too-many-lines disable' requirement. A fuller 3-way split needs a budget
+    exception.
+  - The long ty ToolSpec justification comment (with its inline pylint disable)
+    moved verbatim into _tool_specs.py; lint passes, but future renames will
+    need to carry it along.
+  - Pre-existing pyright/ty LSP hints about optional dict.get access in
+    dispatch.py (lines ~262/294) are unchanged and remain baseline-clean.
+notes: "Net effect vs story base: _strategies.py/.pyi from the rejected attempt
+  are deleted; new _tool_specs.py/.pyi carry only the ToolSpec registry.
+  Sequencing/imports: dispatch.py imports from ._tool_specs before .cmd_build
+  (ruff-isort order); the stub re-exports TOOLS/TOOLS_BY_NAME with explicit 'as'
+  aliases, which the custom stub checker treats as declarations (ImportFrom
+  names are indexed) and stubtest/pyright verify."
diff --git a/src/python_setup_lint/runner/_tool_specs.py b/src/python_setup_lint/runner/_tool_specs.py
new file mode 100644
index 0000000..aa87371
--- /dev/null
+++ b/src/python_setup_lint/runner/_tool_specs.py
@@ -0,0 +1,102 @@
+from __future__ import annotations
+
+from .types import ToolSpec
+
+__all__ = ["TOOLS", "TOOLS_BY_NAME"]
+
+# ── Tool definitions ────────────────────────────────────────────────
+
+TOOLS: list[ToolSpec] = [
+    ToolSpec("tach check", ["tach", "check"], supports_exclude=True, exclude_flag="-e"),
+    ToolSpec(
+        "ruff format",
+        ["ruff", "format"],
+        supports_fix=False,
+        supports_path=True,
+        supports_exclude=True,
+        default_paths=["src/", "tests/"],
+    ),
+    ToolSpec(
+        "ruff check",
+        ["ruff", "check", "--output-format", "concise"],
+        supports_fix=True,
+        supports_path=True,
+        supports_exclude=True,
+        default_paths=["src/", "tests/"],
+        fix_flags=("--fix", "--exit-non-zero-on-fix"),
+    ),
+    ToolSpec(
+        "rumdl check",
+        ["rumdl", "check"],
+        supports_fix=True,
+        supports_path=True,
+        supports_exclude=True,
+        fix_flags=("--fix",),
+        default_paths=["."],
+    ),
+    ToolSpec(
+        "mypy",
+        ["mypy"],
+        supports_path=True,
+        default_paths=["."],
+    ),
+    ToolSpec(
+        "yamllint",
+        ["yamllint"],
+        supports_path=True,
+        default_paths=["."],
+    ),
+    ToolSpec(
+        "ty check",
+        ["ty", "check"],
+        supports_fix=True,
+        supports_path=True,
+        supports_exclude=True,
+        fix_flags=("--fix",),
+        memory_limit_mb=0,  # 0 disables RLIMIT_AS for ty: Rust runtime reserves ~2.5GB+ virtual address space (thread stacks, mmap arenas) though peak RSS is ~124MB; RLIMIT_AS caps virtual address space, not physical RAM, so the default 2048 MB would crash the Rust binary on startup
+        default_paths=[
+            "src"
+        ],  # ty scoped to src/ only: ty honors its own ignore-comment syntax (not mypy's `# type: ignore[code]`), so 67 existing `# type: ignore[mypy-code]` test suppressions are invisible to ty, producing 38 false positives on test-fixture patterns (monkeypatch, dict-invariance, isinstance-narrowing) that mypy + pyright both certify clean; tests are already type-checked by those 2 independent tools; re-enabling ty on tests would require ~38 duplicate ty-specific ignore comments for zero marginal type-safety gain. (pylint-pyi at line 105 also has default_paths=["src"]—that's a stylistic stub-linter scope, not a type-checker restriction.)  # pylint: disable=unjustified-suppression
+    ),
+    ToolSpec(
+        "mypy.stubtest",
+        ["python", "-m", "mypy.stubtest"],
+    ),
+    ToolSpec(
+        "pyright check",
+        ["pyright", "--outputjson"],
+        supports_path=True,
+        default_paths=["."],
+    ),
+    ToolSpec(
+        "pyright verify types",
+        ["pyright", "--verifytypes"],
+    ),
+    ToolSpec(
+        "pylint",
+        ["pylint"],
+        supports_path=True,
+    ),
+    ToolSpec(
+        "pylint-pyi",
+        ["pylint"],
+        supports_fix=False,
+        supports_path=True,
+        supports_exclude=False,
+        default_paths=["src"],
+    ),
+    ToolSpec(
+        "pylint tests",
+        ["pylint"],
+        supports_fix=False,
+        supports_path=True,
+        supports_exclude=False,
+        default_paths=["tests"],
+    ),
+    ToolSpec(
+        "detect-secrets",
+        ["detect-secrets-hook"],
+    ),
+]
+
+TOOLS_BY_NAME: dict[str, ToolSpec] = {t.name: t for t in TOOLS}
diff --git a/src/python_setup_lint/runner/_tool_specs.pyi b/src/python_setup_lint/runner/_tool_specs.pyi
new file mode 100644
index 0000000..c8826f0
--- /dev/null
+++ b/src/python_setup_lint/runner/_tool_specs.pyi
@@ -0,0 +1,13 @@
+"""Stub for :mod:`python_setup_lint.runner._tool_specs`.
+
+Single-source built-in :class:`ToolSpec` registry, re-exported by
+:mod:`python_setup_lint.runner.dispatch`.
+"""
+
+from .types import ToolSpec
+
+TOOLS: list[ToolSpec]
+"""All 14 tool specifications in execution order (built-ins)."""
+
+TOOLS_BY_NAME: dict[str, ToolSpec]
+"""Tool specs keyed by name for fast lookup (built-ins only)."""
diff --git a/src/python_setup_lint/runner/dispatch.py b/src/python_setup_lint/runner/dispatch.py
index c2984a4..f95e02a 100644
--- a/src/python_setup_lint/runner/dispatch.py
+++ b/src/python_setup_lint/runner/dispatch.py
@@ -1,4 +1,3 @@
-# pylint: disable=too-many-lines  # 542 lines — 14-tool registry + 7 strategy subclasses; splitting would scatter the single-source registry
 from __future__ import annotations
 
 import sys
@@ -7,6 +6,7 @@ from collections.abc import Callable
 from beartype import beartype
 
 from ._config import _default_config_paths
+from ._tool_specs import TOOLS, TOOLS_BY_NAME
 from .cmd_build import (
     _build_command,
     _build_path_and_exclude_args,
@@ -42,101 +42,8 @@ __all__ = [
 
 
 # ── Tool definitions ────────────────────────────────────────────────
-
-TOOLS: list[ToolSpec] = [
-    ToolSpec("tach check", ["tach", "check"], supports_exclude=True, exclude_flag="-e"),
-    ToolSpec(
-        "ruff format",
-        ["ruff", "format"],
-        supports_fix=False,
-        supports_path=True,
-        supports_exclude=True,
-        default_paths=["src/", "tests/"],
-    ),
-    ToolSpec(
-        "ruff check",
-        ["ruff", "check", "--output-format", "concise"],
-        supports_fix=True,
-        supports_path=True,
-        supports_exclude=True,
-        default_paths=["src/", "tests/"],
-        fix_flags=("--fix", "--exit-non-zero-on-fix"),
-    ),
-    ToolSpec(
-        "rumdl check",
-        ["rumdl", "check"],
-        supports_fix=True,
-        supports_path=True,
-        supports_exclude=True,
-        fix_flags=("--fix",),
-        default_paths=["."],
-    ),
-    ToolSpec(
-        "mypy",
-        ["mypy"],
-        supports_path=True,
-        default_paths=["."],
-    ),
-    ToolSpec(
-        "yamllint",
-        ["yamllint"],
-        supports_path=True,
-        default_paths=["."],
-    ),
-    ToolSpec(
-        "ty check",
-        ["ty", "check"],
-        supports_fix=True,
-        supports_path=True,
-        supports_exclude=True,
-        fix_flags=("--fix",),
-        memory_limit_mb=0,  # 0 disables RLIMIT_AS for ty: Rust runtime reserves ~2.5GB+ virtual address space (thread stacks, mmap arenas) though peak RSS is ~124MB; RLIMIT_AS caps virtual address space, not physical RAM, so the default 2048 MB would crash the Rust binary on startup
-        default_paths=[
-            "src"
-        ],  # ty scoped to src/ only: ty honors its own ignore-comment syntax (not mypy's `# type: ignore[code]`), so 67 existing `# type: ignore[mypy-code]` test suppressions are invisible to ty, producing 38 false positives on test-fixture patterns (monkeypatch, dict-invariance, isinstance-narrowing) that mypy + pyright both certify clean; tests are already type-checked by those 2 independent tools; re-enabling ty on tests would require ~38 duplicate ty-specific ignore comments for zero marginal type-safety gain. (pylint-pyi at line 105 also has default_paths=["src"]—that's a stylistic stub-linter scope, not a type-checker restriction.)  # pylint: disable=unjustified-suppression
-    ),
-    ToolSpec(
-        "mypy.stubtest",
-        ["python", "-m", "mypy.stubtest"],
-    ),
-    ToolSpec(
-        "pyright check",
-        ["pyright", "--outputjson"],
-        supports_path=True,
-        default_paths=["."],
-    ),
-    ToolSpec(
-        "pyright verify types",
-        ["pyright", "--verifytypes"],
-    ),
-    ToolSpec(
-        "pylint",
-        ["pylint"],
-        supports_path=True,
-    ),
-    ToolSpec(
-        "pylint-pyi",
-        ["pylint"],
-        supports_fix=False,
-        supports_path=True,
-        supports_exclude=False,
-        default_paths=["src"],
-    ),
-    ToolSpec(
-        "pylint tests",
-        ["pylint"],
-        supports_fix=False,
-        supports_path=True,
-        supports_exclude=False,
-        default_paths=["tests"],
-    ),
-    ToolSpec(
-        "detect-secrets",
-        ["detect-secrets-hook"],
-    ),
-]
-
-TOOLS_BY_NAME: dict[str, ToolSpec] = {t.name: t for t in TOOLS}
+# The 14 built-in specs live in :mod:`._tool_specs` (single source);
+# they are re-exported here as ``dispatch.TOOLS`` / ``dispatch.TOOLS_BY_NAME``.
 
 # ── Single-source registry invariants ───────────────────────────────
 # Public constants consumed by the runner and its tests.  Each set is
diff --git a/src/python_setup_lint/runner/dispatch.pyi b/src/python_setup_lint/runner/dispatch.pyi
index b6f3322..6fe65bb 100644
--- a/src/python_setup_lint/runner/dispatch.pyi
+++ b/src/python_setup_lint/runner/dispatch.pyi
@@ -8,14 +8,10 @@ Seven built-ins override ``build_command`` for tool-specific command shapes
 
 from collections.abc import Callable
 
+from ._tool_specs import TOOLS as TOOLS
+from ._tool_specs import TOOLS_BY_NAME as TOOLS_BY_NAME
 from .types import RunnerConfig, ToolSpec
 
-TOOLS: list[ToolSpec]
-"""All 14 tool specifications in execution order (built-ins)."""
-
-TOOLS_BY_NAME: dict[str, ToolSpec]
-"""Tool specs keyed by name for fast lookup (built-ins only)."""
-
 EXPECTED_TOOL_NAMES: frozenset[str]
 """Names of all 14 built-in tools, derived from :data:`TOOLS`."""
 
diff --git a/tests/runner/test_lint_runner.py b/tests/runner/test_lint_runner.py
index 2c085d5..0968146 100644
--- a/tests/runner/test_lint_runner.py
+++ b/tests/runner/test_lint_runner.py
@@ -4,7 +4,6 @@ Per-tool / per-flag rows are parametrised via shared tables in
 ``tests/runner/_factories.py`` (T12 consolidation).
 """
 
-# pylint: disable=too-many-lines  # test file with many parametrised classes; splitting would hurt readability
 from __future__ import annotations
 
 from pathlib import Path
@@ -14,6 +13,7 @@ import pytest
 
 import python_setup_lint.runner.output as _output_module
 from python_setup_lint.runner import (
+    EXPECTED_TOOL_NAMES,
     STRATEGIES,
     TOOLS,
     TOOLS_BY_NAME,
@@ -47,7 +47,7 @@ _CONFIG = RunnerConfig(cwd=Path.cwd())
 
 
 class TestToolSpec:
-    """The static 14-tool table invariant."""
+    """The built-in tool table invariant (names pinned by the oracle above)."""
 
     def test_tool_spec_given_known_tools_then_present(self) -> None:
         assert frozenset(t.name for t in TOOLS) == EXPECTED_BUILTIN_TOOL_NAMES
@@ -59,7 +59,8 @@ class TestToolSpec:
             "ty check",
         }
         assert all(t.name for t in TOOLS)
-        assert len({t.name for t in TOOLS}) == len(TOOLS) == 14
+        assert frozenset(t.name for t in TOOLS) == EXPECTED_TOOL_NAMES
+        assert len({t.name for t in TOOLS}) == len(TOOLS) == len(EXPECTED_TOOL_NAMES)
 
     def test_tool_spec_given_yamllint_then_default_paths_is_dot(self) -> None:
         """yamllint default_paths changed from config/*.yaml to . (T5 fix)."""

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
