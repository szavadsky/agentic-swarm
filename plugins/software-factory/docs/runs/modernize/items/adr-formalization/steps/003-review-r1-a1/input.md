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
  "slug": "adr-formalization",
  "kind": "no-behavior",
  "title": "Formalize ADRs 009-012 and reconcile stale ADRs",
  "assignment": "Root-owned ADR lifecycle, docs only (no-behavior: tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). Overwrite docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences matching plan (009 no-go-gated infra-first, 010 spike contracts + PYTEST_CURRENT_TEST-only dotted path with loader test, 011 validated-map decomposition with AGENTS split + single-writer table + shift handoff); create docs/adr/ADR-012.md for register() missing-beartype exemption (PyLinter circular import, no @beartype, mixin misc attempt-with-fallback); add staleness notes to ADR-001/005/006; add locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify 12 ADR files each carry Context/Decision/Consequences or explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment). Covers TD3-A1 root-owned rows.",
  "outlineRef": "adr-formalization",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Epic kickoff gated on validated artifacts"
  ],
  "citations": [
    "docs/semantic-justification.md:5-14",
    "AGENTS.md:79-85",
    "pyproject.toml:28-31"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..63ab772
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,163 @@
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
+        durationMs: 323
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 327556
+        details: |2-
+           check] PASSED [0.4s]
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
+          Success: No issues found in 25 files (19ms)
+
+          ============================================================
+          [mypy] PASSED [4.8s]
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
+          [mypy.stubtest] PASSED [7.0s]
+          ===
+          ... [truncated 1845 bytes] ...
+
+          ============================================================
+          [detect-secrets] FAILED (exit=123) [104.1s]
+          ============================================================
+          Traceback (most recent call last):
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/bin/detect-secrets-hook", line 10, in <module>
+              sys.exit(main())
+                       ~~~~^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/pre_commit_hook.py", line 30, in main
+              secrets.scan_file(filename)
+              ~~~~~~~~~~~~~~~~~^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/secrets_collection.py", line 76, in scan_file
+              for secret in scan.scan_file(os.path.join(self.root, convert_local_os_path(filename))):
+                            ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 154, in scan_file
+              for lines in _get_lines_from_file(filename):
+                           ~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 265, in _get_lines_from_file
+              lines = get_transformed_file(cast(NamedIO, f))
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/__init__.py", line 31, in get_transformed_file
+              return transformer.parse_file(file)
+                     ~~~~~~~~~~~~~~~~~~~~~~^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 24, in parse_file
+              return _parse_file(file)
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 49, in _parse_file
+              for key, value, line_number in IniFileParser(file, add_header=add_header):
+                                             ~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 97, in __init__
+              content = file.read()
+            File "<frozen codecs>", line 325, in decode
+          MemoryError
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 42339
+        details: |-
+          [Tach] 1379 tests in 59 files unaffected by changes (~37.1s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ......................................................................ss [ 15%]
+          ss...................................................................... [ 21%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 37%]
+          ........................................................................ [ 42%]
+          ........................................................................ [ 47%]
+          ........................................................................ [ 52%]
+          ........................................................................ [ 58%]
+          ........................................................................ [ 63%]
+          ........................................................................ [ 68%]
+          ........................................................................ [ 74%]
+          ........................................................................ [ 79%]
+          ........................................................................ [ 84%]
+          ........................................................................ [ 89%]
+          ........................................................................ [ 95%]
+          .................................................................        [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1357 passed, 4 skipped, 18 deselected, 4 warnings in 39.91s
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
+        durationMs: 73043
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 71.94s (0:01:11)
+  - id: size
+    status: pass
+    message: "size passed: 0/300 production lines changed"
+    details:
+      changedLines:
+        added: 0
+        deleted: 0
+        total: 0
+        files: []
+      limit: 300
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..6278b59
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md
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
+  "slug": "adr-formalization",
+  "kind": "no-behavior",
+  "title": "Formalize ADRs 009-012 and reconcile stale ADRs",
+  "assignment": "Root-owned ADR lifecycle, docs only (no-behavior: tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). Overwrite docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences matching plan (009 no-go-gated infra-first, 010 spike contracts + PYTEST_CURRENT_TEST-only dotted path with loader test, 011 validated-map decomposition with AGENTS split + single-writer table + shift handoff); create docs/adr/ADR-012.md for register() missing-beartype exemption (PyLinter circular import, no @beartype, mixin misc attempt-with-fallback); add staleness notes to ADR-001/005/006; add locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify 12 ADR files each carry Context/Decision/Consequences or explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment). Covers TD3-A1 root-owned rows.",
+  "outlineRef": "adr-formalization",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1: Epic kickoff gated on validated artifacts"
+  ],
+  "citations": [
+    "docs/semantic-justification.md:5-14",
+    "AGENTS.md:79-85",
+    "pyproject.toml:28-31"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "docs/semantic-justification.md:5-14",
+  "AGENTS.md:79-85",
+  "pyproject.toml:28-31"
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
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..f2c8f66
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:55:33.469Z
+session: 01a1bcbb-0381-76b8-8e1f-19e408b6560b
+endedAt: 2026-11-08T20:12:24.212Z
+usage:
+  inputTokens: 81424
+  outputTokens: 29938
+  costUsd: 0.035946
+repairedFrom: ask
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T19-55-35-169Z_01a1bcbb-0381-76b8-8e1f-19e408b6560b
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..3a31737
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,52 @@
+status: ok
+summary: "Formalized the ADR lifecycle docs-only: rewrote ADR-009/010/011 as
+  full Context/Decision/Consequences records matching plan-3, created ADR-012
+  for the register() missing-beartype/PyLinter circular-import exemption with
+  mixin type-ignore attempt-with-fallback, added explicit
+  stale/superseded/current status notes to ADR-001 through ADR-008 (substantive
+  staleness notes for the requested 001/005/006), and created docs/adr/README.md
+  with a 12-record index plus the design/ locations cross-reference per
+  CodingRules. No source, test, AGENTS.md, CHANGELOG, or root README changes.
+  Verification: pytest suite green (1357 passed, 4 skipped, 18 deselected);
+  rumdl green via the actual lint pipeline; all 12 ADR files carry full sections
+  or an explicit status note."
+target:
+  command: uv run pytest -q
+  customTarget: true
+evidence:
+  - "`uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected, 4 warnings in
+    46.68s (exit 0); no test files changed."
+  - "`uv run lint --tools \"rumdl check\"` -> [rumdl check] PASSED, exit 0, 'No
+    issues found in 25 files' (project config, 22ms)."
+  - "`uv run rumdl check --config config/rumdl.toml docs/adr` -> 'Success: No
+    issues found in 13 files' (exit 0)."
+  - "Structural check over all 12 ADR files: ADR-009/010/011/012 each contain
+    `## Context`, `## Decision`, `## Consequences`; ADR-001..008 each contain an
+    explicit `## Status` note (stale, superseded, or current/not-stale). `ls
+    docs/adr/ADR-*.md | wc -l` = 12."
+  - Readback of docs/adr/README.md index confirms 12 ADR rows and a design/
+    section pointing to design/0001-compose-config-temp-dir.md and
+    design/0002-ty-src-only-exception.md; relative link targets and single
+    trailing newlines verified for all docs/adr files.
+  - "`git status --short` -> only docs/adr/ADR-001..011 modified plus untracked
+    docs/adr/ADR-012.md and docs/adr/README.md; no src/, tests/, AGENTS.md,
+    CHANGELOG.md, or root README changes."
+concerns:
+  - Full `uv run lint` and the isolated detect-secrets tool exceeded the shell
+    window on tracked .factory artifacts (known TD3-I2 environmental gate issue,
+    handled by the separate secrets-baseline-exclusion item); ADR markdown
+    contains no secrets or bare hex strings >= 20, and the new untracked
+    ADR-012/README files are not in `git ls-files` until the engine commits.
+  - Added minimal status notes to ADR-002/003/004/007/008 in addition to the
+    explicitly requested ADR-001/005/006 staleness notes, because the
+    assignment's verify clause requires all 12 ADR files to carry either
+    Context/Decision/Consequences or an explicit status/staleness note; all
+    edits stay within the root-owned docs/adr lifecycle.
+  - ADR-012 retains the plan's iteration-2 file:line examples
+    (no_try_import_checker.py:80, beartype_checker.py:21); current HEAD
+    consolidates some checker code into checkers/_base.py, but the decision and
+    standardized justification are unchanged.
+notes: "Docs-only no-behavior change: zero test diffs, so no assertion weakening
+  is possible. Plan source used: .factory/tasks/modernize/plan/plan-3.yaml adrs
+  entries for ADR-009..012 and itemOutlines adr-formalization. Engine owns all
+  git writes; working tree left uncommitted."
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..43b8675
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/checks.yaml
@@ -0,0 +1,7 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/input.md b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/input.md
new file mode 100644
index 0000000..12df891
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/input.md
@@ -0,0 +1,805 @@
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
+  "slug": "adr-formalization",
+  "kind": "no-behavior",
+  "title": "Formalize ADRs 009-012 and reconcile stale ADRs",
+  "assignment": "Root-owned ADR lifecycle, docs only (no-behavior: tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). Overwrite docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences matching plan (009 no-go-gated infra-first, 010 spike contracts + PYTEST_CURRENT_TEST-only dotted path with loader test, 011 validated-map decomposition with AGENTS split + single-writer table + shift handoff); create docs/adr/ADR-012.md for register() missing-beartype exemption (PyLinter circular import, no @beartype, mixin misc attempt-with-fallback); add staleness notes to ADR-001/005/006; add locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify 12 ADR files each carry Context/Decision/Consequences or explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment). Covers TD3-A1 root-owned rows.",
+  "outlineRef": "adr-formalization",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1: Epic kickoff gated on validated artifacts"
+  ],
+  "citations": [
+    "docs/semantic-justification.md:5-14",
+    "AGENTS.md:79-85",
+    "pyproject.toml:28-31"
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
+diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..63ab772
+--- /dev/null
++++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,163 @@
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
++        durationMs: 323
++        details: 181 files already formatted
++      - id: lint
++        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
++          check,mypy.stubtest,pyright check,pyright verify
++          types,pylint,pylint-pyi,pylint tests,detect-secrets'
++        status: fail
++        durationMs: 327556
++        details: |2-
++           check] PASSED [0.4s]
++          ============================================================
++          Configuration
++          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
++          ✅ All modules validated!
++
++          ============================================================
++          [ruff check] PASSED [0.0s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [rumdl check] PASSED [0.0s]
++          ============================================================
++
++          Success: No issues found in 25 files (19ms)
++
++          ============================================================
++          [mypy] PASSED [4.8s]
++          ============================================================
++          Success: no issues found in 56 source files
++
++          ============================================================
++          [yamllint] PASSED [0.2s]
++          ============================================================
++
++          ============================================================
++          [ty check] PASSED [0.2s]
++          ============================================================
++          All checks passed!
++
++          ============================================================
++          [mypy.stubtest] PASSED [7.0s]
++          ===
++          ... [truncated 1845 bytes] ...
++
++          ============================================================
++          [detect-secrets] FAILED (exit=123) [104.1s]
++          ============================================================
++          Traceback (most recent call last):
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/bin/detect-secrets-hook", line 10, in <module>
++              sys.exit(main())
++                       ~~~~^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/pre_commit_hook.py", line 30, in main
++              secrets.scan_file(filename)
++              ~~~~~~~~~~~~~~~~~^^^^^^^^^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/secrets_collection.py", line 76, in scan_file
++              for secret in scan.scan_file(os.path.join(self.root, convert_local_os_path(filename))):
++                            ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 154, in scan_file
++              for lines in _get_lines_from_file(filename):
++                           ~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 265, in _get_lines_from_file
++              lines = get_transformed_file(cast(NamedIO, f))
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/__init__.py", line 31, in get_transformed_file
++              return transformer.parse_file(file)
++                     ~~~~~~~~~~~~~~~~~~~~~~^^^^^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 24, in parse_file
++              return _parse_file(file)
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 49, in _parse_file
++              for key, value, line_number in IniFileParser(file, add_header=add_header):
++                                             ~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
++            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 97, in __init__
++              content = file.read()
++            File "<frozen codecs>", line 325, in decode
++          MemoryError
++
++          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/config/.pylintrc
++      - id: test
++        command: uv run pytest -q
++        status: pass
++        durationMs: 42339
++        details: |-
++          [Tach] 1379 tests in 59 files unaffected by changes (~37.1s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          ........................................................................ [  5%]
++          ........................................................................ [ 10%]
++          ......................................................................ss [ 15%]
++          ss...................................................................... [ 21%]
++          ........................................................................ [ 26%]
++          ........................................................................ [ 31%]
++          ........................................................................ [ 37%]
++          ........................................................................ [ 42%]
++          ........................................................................ [ 47%]
++          ........................................................................ [ 52%]
++          ........................................................................ [ 58%]
++          ........................................................................ [ 63%]
++          ........................................................................ [ 68%]
++          ........................................................................ [ 74%]
++          ........................................................................ [ 79%]
++          ........................................................................ [ 84%]
++          ........................................................................ [ 89%]
++          ........................................................................ [ 95%]
++          .................................................................        [100%]
++          =============================== warnings summary ===============================
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--adr-formalization/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
++          1357 passed, 4 skipped, 18 deselected, 4 warnings in 39.91s
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
++        durationMs: 73043
++        details: |-
++          [Tach] 9 tests in 4 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          .........                                                                [100%]
++          9 passed in 71.94s (0:01:11)
++  - id: size
++    status: pass
++    message: "size passed: 0/300 production lines changed"
++    details:
++      changedLines:
++        added: 0
++        deleted: 0
++        total: 0
++        files: []
++      limit: 300
+diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..6278b59
+--- /dev/null
++++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,60 @@
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
++  "slug": "adr-formalization",
++  "kind": "no-behavior",
++  "title": "Formalize ADRs 009-012 and reconcile stale ADRs",
++  "assignment": "Root-owned ADR lifecycle, docs only (no-behavior: tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). Overwrite docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences matching plan (009 no-go-gated infra-first, 010 spike contracts + PYTEST_CURRENT_TEST-only dotted path with loader test, 011 validated-map decomposition with AGENTS split + single-writer table + shift handoff); create docs/adr/ADR-012.md for register() missing-beartype exemption (PyLinter circular import, no @beartype, mixin misc attempt-with-fallback); add staleness notes to ADR-001/005/006; add locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify 12 ADR files each carry Context/Decision/Consequences or explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment). Covers TD3-A1 root-owned rows.",
++  "outlineRef": "adr-formalization",
++  "milestone": "M1",
++  "wave": 1,
++  "scenarioRefs": [
++    "M1: Epic kickoff gated on validated artifacts"
++  ],
++  "citations": [
++    "docs/semantic-justification.md:5-14",
++    "AGENTS.md:79-85",
++    "pyproject.toml:28-31"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "docs/semantic-justification.md:5-14",
++  "AGENTS.md:79-85",
++  "pyproject.toml:28-31"
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
+diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..f2c8f66
+--- /dev/null
++++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
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
++startedAt: 2026-11-08T19:55:33.469Z
++session: 01a1bcbb-0381-76b8-8e1f-19e408b6560b
++endedAt: 2026-11-08T20:12:24.212Z
++usage:
++  inputTokens: 81424
++  outputTokens: 29938
++  costUsd: 0.035946
++repairedFrom: ask
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T19-55-35-169Z_01a1bcbb-0381-76b8-8e1f-19e408b6560b
+diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..3a31737
+--- /dev/null
++++ b/.factory/tasks/modernize/items/adr-formalization/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,52 @@
++status: ok
++summary: "Formalized the ADR lifecycle docs-only: rewrote ADR-009/010/011 as
++  full Context/Decision/Consequences records matching plan-3, created ADR-012
++  for the register() missing-beartype/PyLinter circular-import exemption with
++  mixin type-ignore attempt-with-fallback, added explicit
++  stale/superseded/current status notes to ADR-001 through ADR-008 (substantive
++  staleness notes for the requested 001/005/006), and created docs/adr/README.md
++  with a 12-record index plus the design/ locations cross-reference per
++  CodingRules. No source, test, AGENTS.md, CHANGELOG, or root README changes.
++  Verification: pytest suite green (1357 passed, 4 skipped, 18 deselected);
++  rumdl green via the actual lint pipeline; all 12 ADR files carry full sections
++  or an explicit status note."
++target:
++  command: uv run pytest -q
++  customTarget: true
++evidence:
++  - "`uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected, 4 warnings in
++    46.68s (exit 0); no test files changed."
++  - "`uv run lint --tools \"rumdl check\"` -> [rumdl check] PASSED, exit 0, 'No
++    issues found in 25 files' (project config, 22ms)."
++  - "`uv run rumdl check --config config/rumdl.toml docs/adr` -> 'Success: No
++    issues found in 13 files' (exit 0)."
++  - "Structural check over all 12 ADR files: ADR-009/010/011/012 each contain
++    `## Context`, `## Decision`, `## Consequences`; ADR-001..008 each contain an
++    explicit `## Status` note (stale, superseded, or current/not-stale). `ls
++    docs/adr/ADR-*.md | wc -l` = 12."
++  - Readback of docs/adr/README.md index confirms 12 ADR rows and a design/
++    section pointing to design/0001-compose-config-temp-dir.md and
++    design/0002-ty-src-only-exception.md; relative link targets and single
++    trailing newlines verified for all docs/adr files.
++  - "`git status --short` -> only docs/adr/ADR-001..011 modified plus untracked
++    docs/adr/ADR-012.md and docs/adr/README.md; no src/, tests/, AGENTS.md,
++    CHANGELOG.md, or root README changes."
++concerns:
++  - Full `uv run lint` and the isolated detect-secrets tool exceeded the shell
++    window on tracked .factory artifacts (known TD3-I2 environmental gate issue,
++    handled by the separate secrets-baseline-exclusion item); ADR markdown
++    contains no secrets or bare hex strings >= 20, and the new untracked
++    ADR-012/README files are not in `git ls-files` until the engine commits.
++  - Added minimal status notes to ADR-002/003/004/007/008 in addition to the
++    explicitly requested ADR-001/005/006 staleness notes, because the
++    assignment's verify clause requires all 12 ADR files to carry either
++    Context/Decision/Consequences or an explicit status/staleness note; all
++    edits stay within the root-owned docs/adr lifecycle.
++  - ADR-012 retains the plan's iteration-2 file:line examples
++    (no_try_import_checker.py:80, beartype_checker.py:21); current HEAD
++    consolidates some checker code into checkers/_base.py, but the decision and
++    standardized justification are unchanged.
++notes: "Docs-only no-behavior change: zero test diffs, so no assertion weakening
++  is possible. Plan source used: .factory/tasks/modernize/plan/plan-3.yaml adrs
++  entries for ADR-009..012 and itemOutlines adr-formalization. Engine owns all
++  git writes; working tree left uncommitted."
+diff --git a/docs/adr/ADR-001.md b/docs/adr/ADR-001.md
+index e7d5514..615a546 100644
+--- a/docs/adr/ADR-001.md
++++ b/docs/adr/ADR-001.md
+@@ -1,3 +1,11 @@
+ # Golden findings snapshot as the behavior-preservation contract
+ 
++## Status
++
++Stale as a problem statement — resolved at HEAD. The committed golden findings snapshot
++(`tests/data/golden/minimal_sample_project_findings.json`) and its tool-count companion
++now pin the normalized finding multiset, including duplicates, and are asserted by
++`tests/test_golden.py` and `tests/integration.py`. Retained for historical context; the
++behavior-preservation contract is enforced by the golden snapshot tests.
++
+ The modernization enforces coding rules, debloats code and tests, removes tests and swaps the semantic model, and it must still preserve every material lint/check behavior. lint.baseline is empty. The integration test only checks that each planted rule name appears somewhere in the output, so duplicate findings, moved lines and new false positives all go undetected.
+diff --git a/docs/adr/ADR-002.md b/docs/adr/ADR-002.md
+index 3514470..56b7882 100644
+--- a/docs/adr/ADR-002.md
++++ b/docs/adr/ADR-002.md
+@@ -1,3 +1,10 @@
+ # Heuristic-gated local decision model for justification checks
+ 
++## Status
++
++Superseded by ADR-009. The model swap is deferred through the no-go gate; iteration 3
++ships the heuristic-first decision backend and tracked cache infrastructure instead, and
++the reranker remains the production fallback. Retained as the problem statement that
++motivated the deferral.
++
+ _semantic.py misuses a sentence-transformers cross-encoder (jina-reranker-v2) as a quality judge. It scores a self-pair, or a query of the form 'rule: unjustified-suppression | context', against a 0.5 threshold. The dependency is heavy, and because it is not installed in dev/CI the heuristic actually makes every decision today. The intent asks for a CPU-friendly small decision model (GLiDE-0.4B or smaller).
+diff --git a/docs/adr/ADR-003.md b/docs/adr/ADR-003.md
+index cbefb8d..e26fa95 100644
+--- a/docs/adr/ADR-003.md
++++ b/docs/adr/ADR-003.md
+@@ -1,3 +1,8 @@
+ # Git-stored, self-cleaning decision cache
+ 
++## Status
++
++Superseded by ADR-010. The tracked cache schema, key encoding, prune policy, explicit
++refresh command, and read-only lint contract are defined there.
++
+ Results are cached in ~/.cache/python-setup/semantic/results.json. That file is gitignored, per machine and unbounded, and it is keyed by a 64-bit truncated SHA-256 that includes code context. As a result, W9704 outcomes can differ between machines with and without the model, and stale entries are never removed. The intent requires a git-stored cache with cleanup.
+diff --git a/docs/adr/ADR-004.md b/docs/adr/ADR-004.md
+index 9fe6a2a..35b819b 100644
+--- a/docs/adr/ADR-004.md
++++ b/docs/adr/ADR-004.md
+@@ -1,3 +1,9 @@
+ # Progressive saga decomposition with disjoint file ownership
+ 
++## Status
++
++Superseded by ADR-011. The validated-map, one-wave decomposition replaces the progressive
++saga split, and the audit-first requirement derived from ADR-008 is retained in the spawn
++gate.
++
+ Three workstreams (coding-rules enforcement, code/test debloat, the semantic swap) span about 28.6k LOC across 184 files. Running them in parallel would mean conflicting edits to shared test infra. The intent also requires testing the infrastructure and assumptions before any debloat.
+diff --git a/docs/adr/ADR-005.md b/docs/adr/ADR-005.md
+index 3f18334..61ad36a 100644
+--- a/docs/adr/ADR-005.md
++++ b/docs/adr/ADR-005.md
+@@ -1,3 +1,12 @@
+ # Ruff format check-only contract with shipped config
+ 
++## Status
++
++Stale as a problem statement — resolved at HEAD. `ruff format` now runs `--check` with the
++shipped config on normal passes and mutates only through the fix-phase
++`build_format_command` (`src/python_setup_lint/runner/dispatch.py`). The registry is
++single-source with 14 `TOOLS` entries, and
++`tests/runner/test_runner_format_contract.py` pins the modes, config mapping, and golden
++tool counts.
++
+ `ruff format` ToolSpec runs plain `ruff format` without --check/--config, rewriting ~109 files with default line-length 88 instead of shipped 130, while TOOLS has 14 entries and 6 tests + docs assert 13.
+diff --git a/docs/adr/ADR-006.md b/docs/adr/ADR-006.md
+index fa80057..d15a30e 100644
+--- a/docs/adr/ADR-006.md
++++ b/docs/adr/ADR-006.md
+@@ -1,3 +1,12 @@
+ # Golden contract hardening on merged implementation
+ 
++## Status
++
++Stale as a problem statement — hardened at HEAD. The golden contract asserts a normalized
++finding multiset (duplicates included), per-tool minimum counts for all 14 registered
++tools, and oracle-rule coverage (`tests/_golden.py`, `tests/test_golden.py`,
++`tests/integration.py`). `slice_tool_section` is exercised by the golden and integration
++tests. `collect_findings` still runs the private pipeline with record parsers, now a
++documented design that mirrors `run_lint` on a pristine copy (`tests/_golden.py:191-231`).
++
+ Merged collect_findings uses private pipeline + record parsers (not run_lint baseline capture), sorts only in serialize, never asserts len!=0 or zero __CRASH__, and slice_tool_section is unused.
+diff --git a/docs/adr/ADR-007.md b/docs/adr/ADR-007.md
+index ad1af0b..3c3f950 100644
+--- a/docs/adr/ADR-007.md
++++ b/docs/adr/ADR-007.md
+@@ -1,3 +1,8 @@
+ # Read-only lint with explicit cache refresh
+ 
++## Status
++
++Superseded by ADR-010. Read-only lint with an explicit cache refresh is the adopted
++contract: the tracked cache is never written by ordinary lint passes.
++
+ Current cache is per-machine, gitignored, unbounded, 64-bit truncated keys, no cleanup. A git-tracked cache that lint writes on every run would make lint non-hermetic.
+diff --git a/docs/adr/ADR-008.md b/docs/adr/ADR-008.md
+index e661203..1634b20 100644
+--- a/docs/adr/ADR-008.md
++++ b/docs/adr/ADR-008.md
+@@ -1,3 +1,8 @@
+ # Progressive epic decomposition after audits
+ 
++## Status
++
++Current — retained, not stale. ADR-011 implements this audit-first decomposition rule and
++re-validates the ownership map at iteration-3 start through a HEAD re-glob.
++
+ Remaining scope spans runner, checkers, setup/testing plus the semantic swap. Audits must read final post-consolidation HEAD before epic decomposition.
+diff --git a/docs/adr/ADR-009.md b/docs/adr/ADR-009.md
+index 642a284..0721d93 100644
+--- a/docs/adr/ADR-009.md
++++ b/docs/adr/ADR-009.md
+@@ -1,3 +1,48 @@
+-# No-go-gated semantic implementation with infrastructure-first delivery
++# ADR-009: No-go-gated semantic implementation with infrastructure-first delivery
+ 
+-Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.
++## Status
++
++Accepted — iteration 3 (2026-11-08). Deferral; operator approval required at close-up.
++
++## Context
++
++Iteration-2 evaluation returned a structural no-go: the contracted accepted stratum
++contains 215 meaningful and 0 meaningless labels, which makes the required 95%
++meaningless-precision metric unevaluable by construction. All 183 repository labels are
++single-author with terse borderlines all marked `True`, so the corpus cannot validate a
++model that claims to reject meaningless justifications.
++
++The candidate model, GLiDE-0.4B, also needs a Fastino license review, and no candidate is
++proven compliant. The intent still asks for a CPU-friendly decision model that replaces
++the cross-encoder reranker and a git-stored cache (see
++[`docs/semantic-justification.md`](../semantic-justification.md) and the `[semantic]`
++extra in `pyproject.toml`), so the capability cannot be silently dropped either.
++
++## Decision
++
++Defer model implementation to a follow-up contingent on both of the following gates:
++
++1. A double-rated, real brush-off sample resolves the corpus-construction defect
++   (independently rated meaningful/meaningless labels with negotiable borderlines).
++2. A human Fastino license decision, required if GLiDE is the recommended candidate.
++
++Iteration 3 delivers everything that is model-independent:
++
++- Heuristic-first `DecisionBackend` plus tracked-cache infrastructure.
++- Runner and checkers debloat work.
++- Docs reconciliation, including this ADR and ADR-010.
++
++Follow-up triggers are recorded as the double-rated sample, the license decision, and a
++CPU benchmark. The close-up report must not claim that the semantic model swap is
++complete.
++
++## Consequences
++
++- No model ships in iteration 3; the intent's swap clause is explicitly deferred until a
++  compliant model is proven.
++- Epics build backend and cache infrastructure against `FakeBackend` and a tracked cache;
++  model wiring remains a bounded follow-up once the verdict lands.
++- Infrastructure-first sequencing pins the backend/cache contracts and exercises them
++  without taking on model risk or license risk.
++- The operator must approve an infrastructure-only close-up: "heuristic-first" remains the
++  production behavior, and the reranker/model replacement is documented as open work.
+diff --git a/docs/adr/ADR-010.md b/docs/adr/ADR-010.md
+index 51d5d64..8aa7c57 100644
+--- a/docs/adr/ADR-010.md
++++ b/docs/adr/ADR-010.md
+@@ -1,3 +1,52 @@
+-# Adopt iteration-2 semantic spike contracts as build baseline
++# ADR-010: Adopt iteration-2 semantic spike contracts as build baseline
+ 
+-Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending.
++## Status
++
++Accepted — iteration 3 (2026-11-08). Contracts frozen; writer verdict consumed first.
++
++## Context
++
++The cache schema, key encoding, prune policy, refresh command, writer identity and
++timing, and `--path` scoping were designed by iteration-2 spikes. The pylint writer
++verdict that is the cache-design-spike input is still pending (tracked as TD3-I1), so the
++concurrency semantics must be consumed from that verdict rather than invented.
++
++Separately, the test-only dotted-path backend import would be an arbitrary-code-execution
++surface if honored in production lint: an environment variable that names an arbitrary
++`module:attribute` could run application code under the lint process. The production
++default must stay hermetic.
++
++## Decision
++
++Adopt the iteration-2 spike contracts as authoritative unless contradicted at HEAD:
++
++- **Backend protocol** — `DecisionBackend` Protocol with
++  `decide(justification, rule, context) -> float` in `[0.0, 1.0]` and a heuristic-first
++  hard gate.
++- **Tracked cache** — `.python-setup-decisions.json` at the linted project root, a JSON
++  array serialized sorted with `indent=2` and `sort_keys`, containing no bare hex strings
++  of length >= 20 and passing the secrets scan.
++- **Read-only lint** — normal lint runs are read-only with a hash-asserted zero-write
++  check; no cache mutation on ordinary passes.
++- **Explicit refresh** — cache updates happen only through an explicit CI-guarded refresh
++  path (lockfile + merge + atomic replace).
++- **Pruning** — prune entries for missing files and stale model identifiers.
++- **Writer-first concurrency** — take the single writer/timing verdict from the
++  `pylint-cache-assumptions` evidence first; merge the pending item before implementing
++  if it is still unmerged. Do not invent lock or merge semantics.
++
++`PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is
++set, that is, for pytest-managed runs. Production lint ignores the variable. A loader
++test pins both behaviors: the dotted path is honored under pytest, and it is ignored when
++the `PYTEST_CURRENT_TEST` marker is removed.
++
++## Consequences
++
++- Backend and cache work proceeds against pinned contracts without waiting for the model
++  verdict; the borderline test-only import surface is settled independently.
++- A compliant model plugs in through `get_backend()` plus `DECISION_MODEL` with no
++  pipeline refactor.
++- The dotted-path surface is test-only by construction, verified by the loader test, so
++  production lint cannot be turned into an arbitrary-code-execution vector.
++- Lint remains hermetic: read-only on normal passes, with cache writes confined to the
++  explicit refresh path and concurrency semantics owned by the pylint verdict.
+diff --git a/docs/adr/ADR-011.md b/docs/adr/ADR-011.md
+index 9417b07..ddde877 100644
+--- a/docs/adr/ADR-011.md
++++ b/docs/adr/ADR-011.md
+@@ -1,3 +1,81 @@
+-# Validated-map epic decomposition in one wave
++# ADR-011: Validated-map epic decomposition with defined AGENTS split and shift handoff
+ 
+-M4 audits merged with the unified 5-owner map (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15) but report completeness validates at iteration-3 replan via HEAD re-glob per ADR-008; several headline findings (dispatch.py 542-line disable, baseline compat shims, duplicated factory disables) are already verified at HEAD.
++## Status
++
++Accepted — iteration 3 (2026-11-08). Spawn gate: validated map revision at HEAD.
++
++## Context
++
++M4 audits merged with the unified five-owner map (runner/checkers/setup-testing/semantic/
++root, counts 67/83/15/4/15), but report completeness validates at the iteration-3 replan
++through a HEAD re-glob per ADR-008. Several headline findings — the 542-line
++`dispatch.py` disable, baseline compatibility shims, and duplicated factory disables —
++are already verified at HEAD.
++
++AGENTS.md section assignment, shared-file edits, packaging exceptions, and the
++epic-to-root shift-report handoff need machine-checkable definitions: no cross-epic
++dependency edges exist, and agents must never run git writes. Without explicit ownership,
++parallel epics would edit the same shared files and produce unreviewable merges.
++
++## Decision
++
++Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, with a ±5 drift
++budget per owner), then spawn the runner, checkers, and semantic epics in one wave.
++Setup-testing files are assigned to `epic-runner-modernize` (runner/** plus
++`setup.py`/`_setup_*.py`/`testing.py` and the setup/install tests).
++
++### AGENTS.md split
++
++The split names exact rows, with an engine-enforced wave order:
++
++- Runner-owned (if assigned at re-glob): `## Quick Commands` rows (`:9-11`) and the
++  `## Tool Scope` table (add the `ruff format` row).
++- Semantic-owned: the `### Semantic justification pipeline` subsection only.
++- Checkers never touches AGENTS.md.
++- The engine schedules the runner AGENTS.md item in an earlier wave than the semantic
++  pipeline item; the order is recorded at kickoff.
++- Semantic verifies read-only via `git merge-base` that its base contains the runner merge
++  when runner was assigned; otherwise it waits.
++
++### Shared-file single-writer table
++
++No concurrent edits; each row names exactly one writer:
++
++- `checkers/_base.py` — semantic only. Checkers puts its stream helper in the new
++  checkers-owned `_source_stream.py`, with zero `_base.py` diff.
++- `no_try_import_checker.py` `register()` disable line plus
++  `_OPTIONAL_IMPORT_PATTERNS` — semantic only; checkers skips that line.
++- The `test_suppression` file — checkers owns all lines except the
++  `TestSuppressionRerankerPipeline` class block (semantic).
++- `trivial_wrapper` exemption list — checkers, with the `peek_fallback_tools` line
++  preconditioned on reading the runner close-up (deleted iff runner confirms shim
++  deletion).
++
++### Packaging exception
++
++Semantic solely owns the `pyproject.toml` `[semantic]` extra block and `uv.lock`
++regeneration — a single writer and an enumerated exception to root-owned repo-root files.
++`.gitignore` stays untouched (legacy `.cache` lines remain; the decisions file is
++committed). There is no hatch entry: the tracked cache is consumer-runtime data, not a
++wheel payload.
++
++### Shift-report handoff
++
++Each epic emits a shift-report section or an explicit no-shift declaration in its
++close-up report. The M2 `replanAfter: true` gate is enforceable: the engine schedules no
++M3 item until the replan after the M2 epic close-ups. Root
++`epic-shift-report-collection` is the first post-replan item, stays pending unless all
++three close-ups exist, and consolidates the handoff record that `golden-regen-hatch`
++consumes.
++
++## Consequences
++
++- Subsystem epics start with dispute-free ownership; the kickoff gate resolves disputes
++  before epic waves scale.
++- No concurrent shared-file edits occur, because the single-writer table assigns every
++  contested line to exactly one epic.
++- AGENTS.md conflicts are avoided by the heading split plus the engine wave order, and
++  the merge-base check proves the ordering instead of assuming it.
++- M3 close-out consumes a single handoff record gated by the M2 replan, so a missing
++  close-up fails open (the item stays pending) rather than silently shipping an
++  incomplete handoff.
+diff --git a/docs/adr/ADR-012.md b/docs/adr/ADR-012.md
+new file mode 100644
+index 0000000..c1940a2
+--- /dev/null
++++ b/docs/adr/ADR-012.md
+@@ -0,0 +1,41 @@
++# ADR-012: register() missing-beartype exemption for PyLinter circular import
++
++## Status
++
++Accepted — iteration 3 (2026-11-08). Exemption plus attempt-with-fallback for mixins.
++
++## Context
++
++Every checker `register(linter: PyLinter)` omits `@beartype` with a `missing-beartype`
++disable citing PyLinter runtime-unavailability or a circular import (for example
++`no_try_import_checker.py:80`). Two constraints collide:
++
++- Adding `@beartype` to `register()` breaks the import: `PyLinter` is a pylint internal
++  type that is not available at runtime when the beartype wrapper resolves annotations.
++- Dropping the disable retriggers the custom `missing-beartype` checker.
++
++Separately, four mixin checkers suppress a `SourceRootMixin.options` versus
++`BaseChecker.options` conflict (for example `beartype_checker.py:21`). Whether a shared
++typed base can remove that suppression is unproven and may be blocked by pylint's own
++typing.
++
++## Decision
++
++Retain the `missing-beartype` disable on all `register()` functions with a standardized
++justification: PyLinter is a pylint internal type unavailable at runtime for beartype,
++and importing it eagerly creates a circular import. The annotation stays `PyLinter` under
++`TYPE_CHECKING`. No `@beartype` is added to `register()`.
++
++For the mixin `type: ignore[misc]` suppressions, attempt removal through a shared typed
++base. This is attempt-with-fallback: if pylint typing blocks removal, retain the
++suppression with the standardized justification and report the blocker. Both outcomes
++satisfy the epic.
++
++## Consequences
++
++- `register()` disables remain as documented exemptions, counted as exempt in epic
++  acceptance rather than as violations.
++- Mixin `type: ignore[misc]` removal is attempt-with-fallback: either a clean removal or a
++  standardized retained justification, both verifiable from the epic report.
++- No runtime import cycle is introduced and no `missing-beartype` false-positive churn is
++  created by the checker registration path.
+diff --git a/docs/adr/README.md b/docs/adr/README.md
+new file mode 100644
+index 0000000..0dd088b
+--- /dev/null
++++ b/docs/adr/README.md
+@@ -0,0 +1,40 @@
++# Architecture Decision Records
++
++This directory is the modernization decision register for python-setup. Every file is a
++single-topic ADR. The active records use `## Context`, `## Decision`, and `## Consequences`;
++legacy problem statements carry a `## Status` note recording whether they are stale,
++superseded, or still current.
++
++## Locations
++
++Per [`CodingRules.md`](../../CodingRules.md) (Project Documentation Layout → Contributor /
++Agent), ongoing architecture decisions, data flow, and design notes belong in
++[`../../design/`](../../design/) as one-topic-per-file ADRs. This directory holds the
++decision register created during the modernization epic; both locations use the same ADR
++format, and new contributor or agent architecture notes should be added under `design/`.
++
++## Index
++
++| ADR | Title | Status |
++|---|---|---|
++| [ADR-001](ADR-001.md) | Golden findings snapshot as the behavior-preservation contract | Stale — resolved at HEAD |
++| [ADR-002](ADR-002.md) | Heuristic-gated local decision model for justification checks | Superseded by ADR-009 |
++| [ADR-003](ADR-003.md) | Git-stored, self-cleaning decision cache | Superseded by ADR-010 |
++| [ADR-004](ADR-004.md) | Progressive saga decomposition with disjoint file ownership | Superseded by ADR-011 |
++| [ADR-005](ADR-005.md) | Ruff format check-only contract with shipped config | Stale — resolved at HEAD |
++| [ADR-006](ADR-006.md) | Golden contract hardening on merged implementation | Stale — hardened at HEAD |
++| [ADR-007](ADR-007.md) | Read-only lint with explicit cache refresh | Superseded by ADR-010 |
++| [ADR-008](ADR-008.md) | Progressive epic decomposition after audits | Current |
++| [ADR-009](ADR-009.md) | No-go-gated semantic implementation with infrastructure-first delivery | Accepted |
++| [ADR-010](ADR-010.md) | Adopt iteration-2 semantic spike contracts as build baseline | Accepted |
++| [ADR-011](ADR-011.md) | Validated-map epic decomposition with defined AGENTS split and shift handoff | Accepted |
++| [ADR-012](ADR-012.md) | register() missing-beartype exemption for PyLinter circular import | Accepted |
++
++## Design notes
++
++Contributor- and agent-facing architecture notes live under `design/`:
++
++| Design note | Title |
++|---|---|
++| [0001](../../design/0001-compose-config-temp-dir.md) | Config composers — pyright writes to cwd, ruff writes to temp-dir |
++| [0002](../../design/0002-ty-src-only-exception.md) | ty src-only exception |
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
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..ffbb806
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T20:21:37.285Z
+session: 01a1bcd2-dc75-73ec-b019-6b61eb062a93
+endedAt: 2026-11-08T20:23:02.178Z
+usage:
+  inputTokens: 29960
+  outputTokens: 9798
+  costUsd: 0.005489
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T20-21-38-037Z_01a1bcd2-dc75-73ec-b019-6b61eb062a93.jsonl
diff --git a/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..efa89e2
--- /dev/null
+++ b/.factory/tasks/modernize/items/adr-formalization/steps/002-qa-r1-a1/output.yaml
@@ -0,0 +1,15 @@
+status: approved
+summary: "Docs-only no-behavior item verified: 12 ADRs structured, rumdl clean,
+  zero src/tests diff."
+suggestions:
+  - id: adr012-full-paths
+    disposition: optional
+    summary: ADR-012 examples could include conformance/ path prefix
+    detail: "ADR-012 cites no_try_import_checker.py:80 and beartype_checker.py:21;
+      both verified accurate at HEAD under
+      src/python_setup_lint/checkers/conformance/. Filenames alone are grep-able
+      and correct, so this is polish only: prefixing with conformance/ would
+      save readers one lookup step."
+    location:
+      file: docs/adr/ADR-012.md
+      line: 11
diff --git a/docs/adr/ADR-001.md b/docs/adr/ADR-001.md
index e7d5514..615a546 100644
--- a/docs/adr/ADR-001.md
+++ b/docs/adr/ADR-001.md
@@ -1,3 +1,11 @@
 # Golden findings snapshot as the behavior-preservation contract
 
+## Status
+
+Stale as a problem statement — resolved at HEAD. The committed golden findings snapshot
+(`tests/data/golden/minimal_sample_project_findings.json`) and its tool-count companion
+now pin the normalized finding multiset, including duplicates, and are asserted by
+`tests/test_golden.py` and `tests/integration.py`. Retained for historical context; the
+behavior-preservation contract is enforced by the golden snapshot tests.
+
 The modernization enforces coding rules, debloats code and tests, removes tests and swaps the semantic model, and it must still preserve every material lint/check behavior. lint.baseline is empty. The integration test only checks that each planted rule name appears somewhere in the output, so duplicate findings, moved lines and new false positives all go undetected.
diff --git a/docs/adr/ADR-002.md b/docs/adr/ADR-002.md
index 3514470..56b7882 100644
--- a/docs/adr/ADR-002.md
+++ b/docs/adr/ADR-002.md
@@ -1,3 +1,10 @@
 # Heuristic-gated local decision model for justification checks
 
+## Status
+
+Superseded by ADR-009. The model swap is deferred through the no-go gate; iteration 3
+ships the heuristic-first decision backend and tracked cache infrastructure instead, and
+the reranker remains the production fallback. Retained as the problem statement that
+motivated the deferral.
+
 _semantic.py misuses a sentence-transformers cross-encoder (jina-reranker-v2) as a quality judge. It scores a self-pair, or a query of the form 'rule: unjustified-suppression | context', against a 0.5 threshold. The dependency is heavy, and because it is not installed in dev/CI the heuristic actually makes every decision today. The intent asks for a CPU-friendly small decision model (GLiDE-0.4B or smaller).
diff --git a/docs/adr/ADR-003.md b/docs/adr/ADR-003.md
index cbefb8d..e26fa95 100644
--- a/docs/adr/ADR-003.md
+++ b/docs/adr/ADR-003.md
@@ -1,3 +1,8 @@
 # Git-stored, self-cleaning decision cache
 
+## Status
+
+Superseded by ADR-010. The tracked cache schema, key encoding, prune policy, explicit
+refresh command, and read-only lint contract are defined there.
+
 Results are cached in ~/.cache/python-setup/semantic/results.json. That file is gitignored, per machine and unbounded, and it is keyed by a 64-bit truncated SHA-256 that includes code context. As a result, W9704 outcomes can differ between machines with and without the model, and stale entries are never removed. The intent requires a git-stored cache with cleanup.
diff --git a/docs/adr/ADR-004.md b/docs/adr/ADR-004.md
index 9fe6a2a..35b819b 100644
--- a/docs/adr/ADR-004.md
+++ b/docs/adr/ADR-004.md
@@ -1,3 +1,9 @@
 # Progressive saga decomposition with disjoint file ownership
 
+## Status
+
+Superseded by ADR-011. The validated-map, one-wave decomposition replaces the progressive
+saga split, and the audit-first requirement derived from ADR-008 is retained in the spawn
+gate.
+
 Three workstreams (coding-rules enforcement, code/test debloat, the semantic swap) span about 28.6k LOC across 184 files. Running them in parallel would mean conflicting edits to shared test infra. The intent also requires testing the infrastructure and assumptions before any debloat.
diff --git a/docs/adr/ADR-005.md b/docs/adr/ADR-005.md
index 3f18334..61ad36a 100644
--- a/docs/adr/ADR-005.md
+++ b/docs/adr/ADR-005.md
@@ -1,3 +1,12 @@
 # Ruff format check-only contract with shipped config
 
+## Status
+
+Stale as a problem statement — resolved at HEAD. `ruff format` now runs `--check` with the
+shipped config on normal passes and mutates only through the fix-phase
+`build_format_command` (`src/python_setup_lint/runner/dispatch.py`). The registry is
+single-source with 14 `TOOLS` entries, and
+`tests/runner/test_runner_format_contract.py` pins the modes, config mapping, and golden
+tool counts.
+
 `ruff format` ToolSpec runs plain `ruff format` without --check/--config, rewriting ~109 files with default line-length 88 instead of shipped 130, while TOOLS has 14 entries and 6 tests + docs assert 13.
diff --git a/docs/adr/ADR-006.md b/docs/adr/ADR-006.md
index fa80057..d15a30e 100644
--- a/docs/adr/ADR-006.md
+++ b/docs/adr/ADR-006.md
@@ -1,3 +1,12 @@
 # Golden contract hardening on merged implementation
 
+## Status
+
+Stale as a problem statement — hardened at HEAD. The golden contract asserts a normalized
+finding multiset (duplicates included), per-tool minimum counts for all 14 registered
+tools, and oracle-rule coverage (`tests/_golden.py`, `tests/test_golden.py`,
+`tests/integration.py`). `slice_tool_section` is exercised by the golden and integration
+tests. `collect_findings` still runs the private pipeline with record parsers, now a
+documented design that mirrors `run_lint` on a pristine copy (`tests/_golden.py:191-231`).
+
 Merged collect_findings uses private pipeline + record parsers (not run_lint baseline capture), sorts only in serialize, never asserts len!=0 or zero __CRASH__, and slice_tool_section is unused.
diff --git a/docs/adr/ADR-007.md b/docs/adr/ADR-007.md
index ad1af0b..3c3f950 100644
--- a/docs/adr/ADR-007.md
+++ b/docs/adr/ADR-007.md
@@ -1,3 +1,8 @@
 # Read-only lint with explicit cache refresh
 
+## Status
+
+Superseded by ADR-010. Read-only lint with an explicit cache refresh is the adopted
+contract: the tracked cache is never written by ordinary lint passes.
+
 Current cache is per-machine, gitignored, unbounded, 64-bit truncated keys, no cleanup. A git-tracked cache that lint writes on every run would make lint non-hermetic.
diff --git a/docs/adr/ADR-008.md b/docs/adr/ADR-008.md
index e661203..1634b20 100644
--- a/docs/adr/ADR-008.md
+++ b/docs/adr/ADR-008.md
@@ -1,3 +1,8 @@
 # Progressive epic decomposition after audits
 
+## Status
+
+Current — retained, not stale. ADR-011 implements this audit-first decomposition rule and
+re-validates the ownership map at iteration-3 start through a HEAD re-glob.
+
 Remaining scope spans runner, checkers, setup/testing plus the semantic swap. Audits must read final post-consolidation HEAD before epic decomposition.
diff --git a/docs/adr/ADR-009.md b/docs/adr/ADR-009.md
index 642a284..0721d93 100644
--- a/docs/adr/ADR-009.md
+++ b/docs/adr/ADR-009.md
@@ -1,3 +1,48 @@
-# No-go-gated semantic implementation with infrastructure-first delivery
+# ADR-009: No-go-gated semantic implementation with infrastructure-first delivery
 
-Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.
+## Status
+
+Accepted — iteration 3 (2026-11-08). Deferral; operator approval required at close-up.
+
+## Context
+
+Iteration-2 evaluation returned a structural no-go: the contracted accepted stratum
+contains 215 meaningful and 0 meaningless labels, which makes the required 95%
+meaningless-precision metric unevaluable by construction. All 183 repository labels are
+single-author with terse borderlines all marked `True`, so the corpus cannot validate a
+model that claims to reject meaningless justifications.
+
+The candidate model, GLiDE-0.4B, also needs a Fastino license review, and no candidate is
+proven compliant. The intent still asks for a CPU-friendly decision model that replaces
+the cross-encoder reranker and a git-stored cache (see
+[`docs/semantic-justification.md`](../semantic-justification.md) and the `[semantic]`
+extra in `pyproject.toml`), so the capability cannot be silently dropped either.
+
+## Decision
+
+Defer model implementation to a follow-up contingent on both of the following gates:
+
+1. A double-rated, real brush-off sample resolves the corpus-construction defect
+   (independently rated meaningful/meaningless labels with negotiable borderlines).
+2. A human Fastino license decision, required if GLiDE is the recommended candidate.
+
+Iteration 3 delivers everything that is model-independent:
+
+- Heuristic-first `DecisionBackend` plus tracked-cache infrastructure.
+- Runner and checkers debloat work.
+- Docs reconciliation, including this ADR and ADR-010.
+
+Follow-up triggers are recorded as the double-rated sample, the license decision, and a
+CPU benchmark. The close-up report must not claim that the semantic model swap is
+complete.
+
+## Consequences
+
+- No model ships in iteration 3; the intent's swap clause is explicitly deferred until a
+  compliant model is proven.
+- Epics build backend and cache infrastructure against `FakeBackend` and a tracked cache;
+  model wiring remains a bounded follow-up once the verdict lands.
+- Infrastructure-first sequencing pins the backend/cache contracts and exercises them
+  without taking on model risk or license risk.
+- The operator must approve an infrastructure-only close-up: "heuristic-first" remains the
+  production behavior, and the reranker/model replacement is documented as open work.
diff --git a/docs/adr/ADR-010.md b/docs/adr/ADR-010.md
index 51d5d64..8aa7c57 100644
--- a/docs/adr/ADR-010.md
+++ b/docs/adr/ADR-010.md
@@ -1,3 +1,52 @@
-# Adopt iteration-2 semantic spike contracts as build baseline
+# ADR-010: Adopt iteration-2 semantic spike contracts as build baseline
 
-Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending.
+## Status
+
+Accepted — iteration 3 (2026-11-08). Contracts frozen; writer verdict consumed first.
+
+## Context
+
+The cache schema, key encoding, prune policy, refresh command, writer identity and
+timing, and `--path` scoping were designed by iteration-2 spikes. The pylint writer
+verdict that is the cache-design-spike input is still pending (tracked as TD3-I1), so the
+concurrency semantics must be consumed from that verdict rather than invented.
+
+Separately, the test-only dotted-path backend import would be an arbitrary-code-execution
+surface if honored in production lint: an environment variable that names an arbitrary
+`module:attribute` could run application code under the lint process. The production
+default must stay hermetic.
+
+## Decision
+
+Adopt the iteration-2 spike contracts as authoritative unless contradicted at HEAD:
+
+- **Backend protocol** — `DecisionBackend` Protocol with
+  `decide(justification, rule, context) -> float` in `[0.0, 1.0]` and a heuristic-first
+  hard gate.
+- **Tracked cache** — `.python-setup-decisions.json` at the linted project root, a JSON
+  array serialized sorted with `indent=2` and `sort_keys`, containing no bare hex strings
+  of length >= 20 and passing the secrets scan.
+- **Read-only lint** — normal lint runs are read-only with a hash-asserted zero-write
+  check; no cache mutation on ordinary passes.
+- **Explicit refresh** — cache updates happen only through an explicit CI-guarded refresh
+  path (lockfile + merge + atomic replace).
+- **Pruning** — prune entries for missing files and stale model identifiers.
+- **Writer-first concurrency** — take the single writer/timing verdict from the
+  `pylint-cache-assumptions` evidence first; merge the pending item before implementing
+  if it is still unmerged. Do not invent lock or merge semantics.
+
+`PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is
+set, that is, for pytest-managed runs. Production lint ignores the variable. A loader
+test pins both behaviors: the dotted path is honored under pytest, and it is ignored when
+the `PYTEST_CURRENT_TEST` marker is removed.
+
+## Consequences
+
+- Backend and cache work proceeds against pinned contracts without waiting for the model
+  verdict; the borderline test-only import surface is settled independently.
+- A compliant model plugs in through `get_backend()` plus `DECISION_MODEL` with no
+  pipeline refactor.
+- The dotted-path surface is test-only by construction, verified by the loader test, so
+  production lint cannot be turned into an arbitrary-code-execution vector.
+- Lint remains hermetic: read-only on normal passes, with cache writes confined to the
+  explicit refresh path and concurrency semantics owned by the pylint verdict.
diff --git a/docs/adr/ADR-011.md b/docs/adr/ADR-011.md
index 9417b07..ddde877 100644
--- a/docs/adr/ADR-011.md
+++ b/docs/adr/ADR-011.md
@@ -1,3 +1,81 @@
-# Validated-map epic decomposition in one wave
+# ADR-011: Validated-map epic decomposition with defined AGENTS split and shift handoff
 
-M4 audits merged with the unified 5-owner map (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15) but report completeness validates at iteration-3 replan via HEAD re-glob per ADR-008; several headline findings (dispatch.py 542-line disable, baseline compat shims, duplicated factory disables) are already verified at HEAD.
+## Status
+
+Accepted — iteration 3 (2026-11-08). Spawn gate: validated map revision at HEAD.
+
+## Context
+
+M4 audits merged with the unified five-owner map (runner/checkers/setup-testing/semantic/
+root, counts 67/83/15/4/15), but report completeness validates at the iteration-3 replan
+through a HEAD re-glob per ADR-008. Several headline findings — the 542-line
+`dispatch.py` disable, baseline compatibility shims, and duplicated factory disables —
+are already verified at HEAD.
+
+AGENTS.md section assignment, shared-file edits, packaging exceptions, and the
+epic-to-root shift-report handoff need machine-checkable definitions: no cross-epic
+dependency edges exist, and agents must never run git writes. Without explicit ownership,
+parallel epics would edit the same shared files and produce unreviewable merges.
+
+## Decision
+
+Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, with a ±5 drift
+budget per owner), then spawn the runner, checkers, and semantic epics in one wave.
+Setup-testing files are assigned to `epic-runner-modernize` (runner/** plus
+`setup.py`/`_setup_*.py`/`testing.py` and the setup/install tests).
+
+### AGENTS.md split
+
+The split names exact rows, with an engine-enforced wave order:
+
+- Runner-owned (if assigned at re-glob): `## Quick Commands` rows (`:9-11`) and the
+  `## Tool Scope` table (add the `ruff format` row).
+- Semantic-owned: the `### Semantic justification pipeline` subsection only.
+- Checkers never touches AGENTS.md.
+- The engine schedules the runner AGENTS.md item in an earlier wave than the semantic
+  pipeline item; the order is recorded at kickoff.
+- Semantic verifies read-only via `git merge-base` that its base contains the runner merge
+  when runner was assigned; otherwise it waits.
+
+### Shared-file single-writer table
+
+No concurrent edits; each row names exactly one writer:
+
+- `checkers/_base.py` — semantic only. Checkers puts its stream helper in the new
+  checkers-owned `_source_stream.py`, with zero `_base.py` diff.
+- `no_try_import_checker.py` `register()` disable line plus
+  `_OPTIONAL_IMPORT_PATTERNS` — semantic only; checkers skips that line.
+- The `test_suppression` file — checkers owns all lines except the
+  `TestSuppressionRerankerPipeline` class block (semantic).
+- `trivial_wrapper` exemption list — checkers, with the `peek_fallback_tools` line
+  preconditioned on reading the runner close-up (deleted iff runner confirms shim
+  deletion).
+
+### Packaging exception
+
+Semantic solely owns the `pyproject.toml` `[semantic]` extra block and `uv.lock`
+regeneration — a single writer and an enumerated exception to root-owned repo-root files.
+`.gitignore` stays untouched (legacy `.cache` lines remain; the decisions file is
+committed). There is no hatch entry: the tracked cache is consumer-runtime data, not a
+wheel payload.
+
+### Shift-report handoff
+
+Each epic emits a shift-report section or an explicit no-shift declaration in its
+close-up report. The M2 `replanAfter: true` gate is enforceable: the engine schedules no
+M3 item until the replan after the M2 epic close-ups. Root
+`epic-shift-report-collection` is the first post-replan item, stays pending unless all
+three close-ups exist, and consolidates the handoff record that `golden-regen-hatch`
+consumes.
+
+## Consequences
+
+- Subsystem epics start with dispute-free ownership; the kickoff gate resolves disputes
+  before epic waves scale.
+- No concurrent shared-file edits occur, because the single-writer table assigns every
+  contested line to exactly one epic.
+- AGENTS.md conflicts are avoided by the heading split plus the engine wave order, and
+  the merge-base check proves the ordering instead of assuming it.
+- M3 close-out consumes a single handoff record gated by the M2 replan, so a missing
+  close-up fails open (the item stays pending) rather than silently shipping an
+  incomplete handoff.
diff --git a/docs/adr/ADR-012.md b/docs/adr/ADR-012.md
new file mode 100644
index 0000000..c1940a2
--- /dev/null
+++ b/docs/adr/ADR-012.md
@@ -0,0 +1,41 @@
+# ADR-012: register() missing-beartype exemption for PyLinter circular import
+
+## Status
+
+Accepted — iteration 3 (2026-11-08). Exemption plus attempt-with-fallback for mixins.
+
+## Context
+
+Every checker `register(linter: PyLinter)` omits `@beartype` with a `missing-beartype`
+disable citing PyLinter runtime-unavailability or a circular import (for example
+`no_try_import_checker.py:80`). Two constraints collide:
+
+- Adding `@beartype` to `register()` breaks the import: `PyLinter` is a pylint internal
+  type that is not available at runtime when the beartype wrapper resolves annotations.
+- Dropping the disable retriggers the custom `missing-beartype` checker.
+
+Separately, four mixin checkers suppress a `SourceRootMixin.options` versus
+`BaseChecker.options` conflict (for example `beartype_checker.py:21`). Whether a shared
+typed base can remove that suppression is unproven and may be blocked by pylint's own
+typing.
+
+## Decision
+
+Retain the `missing-beartype` disable on all `register()` functions with a standardized
+justification: PyLinter is a pylint internal type unavailable at runtime for beartype,
+and importing it eagerly creates a circular import. The annotation stays `PyLinter` under
+`TYPE_CHECKING`. No `@beartype` is added to `register()`.
+
+For the mixin `type: ignore[misc]` suppressions, attempt removal through a shared typed
+base. This is attempt-with-fallback: if pylint typing blocks removal, retain the
+suppression with the standardized justification and report the blocker. Both outcomes
+satisfy the epic.
+
+## Consequences
+
+- `register()` disables remain as documented exemptions, counted as exempt in epic
+  acceptance rather than as violations.
+- Mixin `type: ignore[misc]` removal is attempt-with-fallback: either a clean removal or a
+  standardized retained justification, both verifiable from the epic report.
+- No runtime import cycle is introduced and no `missing-beartype` false-positive churn is
+  created by the checker registration path.
diff --git a/docs/adr/README.md b/docs/adr/README.md
new file mode 100644
index 0000000..0dd088b
--- /dev/null
+++ b/docs/adr/README.md
@@ -0,0 +1,40 @@
+# Architecture Decision Records
+
+This directory is the modernization decision register for python-setup. Every file is a
+single-topic ADR. The active records use `## Context`, `## Decision`, and `## Consequences`;
+legacy problem statements carry a `## Status` note recording whether they are stale,
+superseded, or still current.
+
+## Locations
+
+Per [`CodingRules.md`](../../CodingRules.md) (Project Documentation Layout → Contributor /
+Agent), ongoing architecture decisions, data flow, and design notes belong in
+[`../../design/`](../../design/) as one-topic-per-file ADRs. This directory holds the
+decision register created during the modernization epic; both locations use the same ADR
+format, and new contributor or agent architecture notes should be added under `design/`.
+
+## Index
+
+| ADR | Title | Status |
+|---|---|---|
+| [ADR-001](ADR-001.md) | Golden findings snapshot as the behavior-preservation contract | Stale — resolved at HEAD |
+| [ADR-002](ADR-002.md) | Heuristic-gated local decision model for justification checks | Superseded by ADR-009 |
+| [ADR-003](ADR-003.md) | Git-stored, self-cleaning decision cache | Superseded by ADR-010 |
+| [ADR-004](ADR-004.md) | Progressive saga decomposition with disjoint file ownership | Superseded by ADR-011 |
+| [ADR-005](ADR-005.md) | Ruff format check-only contract with shipped config | Stale — resolved at HEAD |
+| [ADR-006](ADR-006.md) | Golden contract hardening on merged implementation | Stale — hardened at HEAD |
+| [ADR-007](ADR-007.md) | Read-only lint with explicit cache refresh | Superseded by ADR-010 |
+| [ADR-008](ADR-008.md) | Progressive epic decomposition after audits | Current |
+| [ADR-009](ADR-009.md) | No-go-gated semantic implementation with infrastructure-first delivery | Accepted |
+| [ADR-010](ADR-010.md) | Adopt iteration-2 semantic spike contracts as build baseline | Accepted |
+| [ADR-011](ADR-011.md) | Validated-map epic decomposition with defined AGENTS split and shift handoff | Accepted |
+| [ADR-012](ADR-012.md) | register() missing-beartype exemption for PyLinter circular import | Accepted |
+
+## Design notes
+
+Contributor- and agent-facing architecture notes live under `design/`:
+
+| Design note | Title |
+|---|---|
+| [0001](../../design/0001-compose-config-temp-dir.md) | Config composers — pyright writes to cwd, ruff writes to temp-dir |
+| [0002](../../design/0002-ty-src-only-exception.md) | ty src-only exception |

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
