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
  "slug": "secrets-baseline-exclusion",
  "kind": "no-behavior",
  "title": "Add .factory/ exclusion to .secrets.baseline",
  "assignment": "Land operator-approved .factory/ exclusion (no-behavior: config-only change with no prod behavior change; tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). First pre-validate filters_used schema against installed detect-secrets version (should_exclude_file signature; list-pattern vs scalar form) and use version-correct form. Then insert ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. No other baseline edits. Verify on clean checkout: full git-ls-files detect-secrets scan exits 0 while planted control secret still exits 1 (reviewer-replicated procedure). Keep residual-risk caveat in report (write-time redaction + periodic unfiltered audits). M1 acceptance cites mechanism + pinned HEAD, not finding counts. Covers TD3-I2.",
  "outlineRef": "secrets-baseline-exclusion",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Secrets gate green by mechanism"
  ],
  "citations": [
    "lint.baseline:1-1",
    "AGENTS.md:121-139"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..86316d9
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,204 @@
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
+        durationMs: 218
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 79920
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
+          Success: No issues found in 23 files (19ms)
+
+          ============================================================
+          [mypy] PASSED [6.2s]
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
+          [mypy.stubtest] PASSED [9.2s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [5.7s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794168135695",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 5.223
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
+          [pylint] PASSED [13.1s]
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
+          [pylint-pyi] PASSED [12.7s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [22.3s]
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
+          [detect-secrets] PASSED [7.9s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 37075
+        details: |-
+          [Tach] 1379 tests in 59 files unaffected by changes (~35.5s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1357 passed, 4 skipped, 18 deselected, 4 warnings in 35.06s
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
+        durationMs: 94374
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 93.25s (0:01:33)
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
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..e41cad0
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md
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
+  "slug": "secrets-baseline-exclusion",
+  "kind": "no-behavior",
+  "title": "Add .factory/ exclusion to .secrets.baseline",
+  "assignment": "Land operator-approved .factory/ exclusion (no-behavior: config-only change with no prod behavior change; tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). First pre-validate filters_used schema against installed detect-secrets version (should_exclude_file signature; list-pattern vs scalar form) and use version-correct form. Then insert ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. No other baseline edits. Verify on clean checkout: full git-ls-files detect-secrets scan exits 0 while planted control secret still exits 1 (reviewer-replicated procedure). Keep residual-risk caveat in report (write-time redaction + periodic unfiltered audits). M1 acceptance cites mechanism + pinned HEAD, not finding counts. Covers TD3-I2.",
+  "outlineRef": "secrets-baseline-exclusion",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1: Secrets gate green by mechanism"
+  ],
+  "citations": [
+    "lint.baseline:1-1",
+    "AGENTS.md:121-139"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "lint.baseline:1-1",
+  "AGENTS.md:121-139"
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
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..c2eecc5
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:54:41.085Z
+session: 01a1bcba-ffd5-748d-9134-999550b9b306
+endedAt: 2026-11-08T20:05:24.653Z
+usage:
+  inputTokens: 50483
+  outputTokens: 18592
+  costUsd: 0.022506
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T19-55-34-229Z_01a1bcba-ffd5-748d-9134-999550b9b306.jsonl
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..01951a3
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,71 @@
+status: ok
+summary: "Added the operator-approved `^\\.factory/` exclusion to
+  `.secrets.baseline` filters_used as
+  `detect_secrets.filters.regex.should_exclude_file` with a list-valued
+  `pattern`, after pre-validating the installed detect-secrets 1.5.0 contract
+  (signature `should_exclude_file(filename: str) -> bool`;
+  `_get_file_exclusion_regex` iterates `settings.filters[path]['pattern']`, so
+  the canonical list form is required). No other baseline edits and no test
+  changes. Verified on the full tracked file list (HEAD
+  b4f45b2100de43ed44acbef1ac5a0704622d535a): the detect-secrets hook now exits 0
+  in 9.2s (pre-change scan of the same list, dominated by 1.8GB of tracked
+  `.factory` model weights, had not completed after >2 minutes), the repo lint
+  runner's detect-secrets step PASSES, a planted control secret still exits 1,
+  the unit suite is green, and the full 14-tool lint gate exits 0."
+target:
+  command: uv run pytest -q
+  customTarget: true
+evidence:
+  - "Pre-validated filter schema against installed detect-secrets 1.5.0:
+    `inspect.signature(detect_secrets.filters.regex.should_exclude_file)` ->
+    `(filename: str) -> bool`; source shows `_get_file_exclusion_regex`
+    iterating `get_settings().filters[path]['pattern']`, and `--exclude-files`
+    argparse collects a list, so inserted `{\"path\":
+    \"detect_secrets.filters.regex.should_exclude_file\", \"pattern\":
+    [\"^\\\\.factory/\"]}` (list form, version-correct)."
+  - "Behavioral proof of the configured filter via detect_secrets API:
+    `configure_settings_from_baseline(json.load('.secrets.baseline'))` then
+    `should_exclude_file('.factory/project.yaml') is True`,
+    `should_exclude_file('.factory/tasks/modernize/journal.ndjson') is True`,
+    `should_exclude_file('src/python_setup_lint/runner/cli.py') is False`,
+    `should_exclude_file('docs/factory.md') is False`."
+  - "Full tracked-file scan after change: `git ls-files -z | xargs -0 uv run
+    detect-secrets-hook --baseline .secrets.baseline` -> exit 0 in 9.2s (859
+    tracked files)."
+  - Pre-change control on the same tracked list (launched before the edit, same
+    command) had not completed after >2 minutes and was stopped at ~3 minutes,
+    consistent with the runner's 120s/tool cap failure caused by 1.8GB of
+    tracked `.factory` model weights (10 tracked .safetensors); post-change
+    completes in 9.2s. Mechanism evidence, not finding counts.
+  - "Planted control secret: wrote `.tmp-control-secret.txt` with an AWS-style
+    access key and secret; `uv run detect-secrets-hook --baseline
+    .secrets.baseline .tmp-control-secret.txt` -> exit 1 (AWS Access Key, Base64
+    High Entropy String, Secret Keyword); file deleted immediately after and
+    `git status --porcelain` confirms no residue."
+  - "Runner integration: `uv run lint --tools detect-secrets` ->
+    `[detect-secrets] PASSED [11.1s]`, exit 0."
+  - "Unit tests: `uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected,
+    exit 0 in 43.27s."
+  - "Full project gate: `uv run lint` -> LINT_EXIT=0 in 85s; detect-secrets
+    PASSED 11.6s, all 14 tools passed."
+  - "JSON validity and diff hygiene: `python3 -m json.tool .secrets.baseline` ->
+    valid; `git diff --stat` -> `.secrets.baseline | 6 ++++++` (only intended
+    6-line insertion, sorted filter order retained); `git status --porcelain` ->
+    ` M .secrets.baseline` only, i.e. zero test-diff and no semantic assertion
+    changes; `.factory` journals remain committed."
+concerns:
+  - "Residual risk: this is a write-time/scan-time exclusion, not prevention.
+    Secrets placed under `.factory/` will no longer be caught by the standard
+    gate and remain committed. Mitigation: periodic unfiltered audits (e.g. run
+    detect-secrets-hook with `--disable-filter
+    detect_secrets.filters.regex.should_exclude_file`, or a scan without the
+    baseline filter) and keep the caveat in the M1 report."
+  - The `.factory` tree contains ~1.8GB of tracked model weights (10
+    `.safetensors`), making the unfiltered scan exceed the 120s per-tool cap;
+    the exclusion is load-bearing for gate runtime, not just noise suppression.
+  - No automated test asserts the baseline filter entry; verification is
+    mechanism-based (API predicate + hook exit codes), as appropriate for a
+    no-behavior config-only change.
+notes: "Final HEAD pinned for M1 citation:
+  b4f45b2100de43ed44acbef1ac5a0704622d535a. Only `.secrets.baseline` changed (6
+  insertions). Zero git write commands were issued."
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..43b8675
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/checks.yaml
@@ -0,0 +1,7 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/input.md b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/input.md
new file mode 100644
index 0000000..1285410
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/input.md
@@ -0,0 +1,465 @@
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
+  "slug": "secrets-baseline-exclusion",
+  "kind": "no-behavior",
+  "title": "Add .factory/ exclusion to .secrets.baseline",
+  "assignment": "Land operator-approved .factory/ exclusion (no-behavior: config-only change with no prod behavior change; tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). First pre-validate filters_used schema against installed detect-secrets version (should_exclude_file signature; list-pattern vs scalar form) and use version-correct form. Then insert ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. No other baseline edits. Verify on clean checkout: full git-ls-files detect-secrets scan exits 0 while planted control secret still exits 1 (reviewer-replicated procedure). Keep residual-risk caveat in report (write-time redaction + periodic unfiltered audits). M1 acceptance cites mechanism + pinned HEAD, not finding counts. Covers TD3-I2.",
+  "outlineRef": "secrets-baseline-exclusion",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1: Secrets gate green by mechanism"
+  ],
+  "citations": [
+    "lint.baseline:1-1",
+    "AGENTS.md:121-139"
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
+diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..86316d9
+--- /dev/null
++++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,204 @@
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
++        durationMs: 218
++        details: 181 files already formatted
++      - id: lint
++        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
++          check,mypy.stubtest,pyright check,pyright verify
++          types,pylint,pylint-pyi,pylint tests,detect-secrets'
++        status: pass
++        durationMs: 79920
++        details: |-
++          ============================================================
++          [tach check] PASSED [0.4s]
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
++          Success: No issues found in 23 files (19ms)
++
++          ============================================================
++          [mypy] PASSED [6.2s]
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
++          [mypy.stubtest] PASSED [9.2s]
++          ============================================================
++
++          ============================================================
++          [pyright check] PASSED [5.7s]
++          ============================================================
++          {
++              "version": "1.1.410",
++              "time": "1794168135695",
++              "generalDiagnostics": [],
++              "summary": {
++                  "filesAnalyzed": 110,
++                  "errorCount": 0,
++                  "warningCount": 0,
++                  "informationCount": 0,
++                  "timeInSec": 5.223
++              }
++          }
++
++
++          ============================================================
++          [pyright verify types] PASSED [1.4s]
++          ============================================================
++            pyright verify types: completenessScore=1
++
++          ============================================================
++          [pylint] PASSED [13.1s]
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
++          [pylint-pyi] PASSED [12.7s]
++          ============================================================
++
++          --------------------------------------------------------------------
++          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
++
++
++          ============================================================
++          [pylint tests] PASSED [22.3s]
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
++          [detect-secrets] PASSED [7.9s]
++          ============================================================
++
++          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/config/.pylintrc
++      - id: test
++        command: uv run pytest -q
++        status: pass
++        durationMs: 37075
++        details: |-
++          [Tach] 1379 tests in 59 files unaffected by changes (~35.5s could be saved). Skip with: pytest --tach
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
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-baseline-exclusion/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
++          1357 passed, 4 skipped, 18 deselected, 4 warnings in 35.06s
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
++        durationMs: 94374
++        details: |-
++          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          .........                                                                [100%]
++          9 passed in 93.25s (0:01:33)
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
+diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..e41cad0
+--- /dev/null
++++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,58 @@
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
++  "slug": "secrets-baseline-exclusion",
++  "kind": "no-behavior",
++  "title": "Add .factory/ exclusion to .secrets.baseline",
++  "assignment": "Land operator-approved .factory/ exclusion (no-behavior: config-only change with no prod behavior change; tests materially identical; QA verifies test-diff contains no semantic assertion weakens; peer review; engine commits, agent zero git writes). First pre-validate filters_used schema against installed detect-secrets version (should_exclude_file signature; list-pattern vs scalar form) and use version-correct form. Then insert ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. No other baseline edits. Verify on clean checkout: full git-ls-files detect-secrets scan exits 0 while planted control secret still exits 1 (reviewer-replicated procedure). Keep residual-risk caveat in report (write-time redaction + periodic unfiltered audits). M1 acceptance cites mechanism + pinned HEAD, not finding counts. Covers TD3-I2.",
++  "outlineRef": "secrets-baseline-exclusion",
++  "milestone": "M1",
++  "wave": 1,
++  "scenarioRefs": [
++    "M1: Secrets gate green by mechanism"
++  ],
++  "citations": [
++    "lint.baseline:1-1",
++    "AGENTS.md:121-139"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "lint.baseline:1-1",
++  "AGENTS.md:121-139"
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
+diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..c2eecc5
+--- /dev/null
++++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/meta.yaml
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
++startedAt: 2026-11-08T19:54:41.085Z
++session: 01a1bcba-ffd5-748d-9134-999550b9b306
++endedAt: 2026-11-08T20:05:24.653Z
++usage:
++  inputTokens: 50483
++  outputTokens: 18592
++  costUsd: 0.022506
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T19-55-34-229Z_01a1bcba-ffd5-748d-9134-999550b9b306.jsonl
+diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..01951a3
+--- /dev/null
++++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,71 @@
++status: ok
++summary: "Added the operator-approved `^\\.factory/` exclusion to
++  `.secrets.baseline` filters_used as
++  `detect_secrets.filters.regex.should_exclude_file` with a list-valued
++  `pattern`, after pre-validating the installed detect-secrets 1.5.0 contract
++  (signature `should_exclude_file(filename: str) -> bool`;
++  `_get_file_exclusion_regex` iterates `settings.filters[path]['pattern']`, so
++  the canonical list form is required). No other baseline edits and no test
++  changes. Verified on the full tracked file list (HEAD
++  b4f45b2100de43ed44acbef1ac5a0704622d535a): the detect-secrets hook now exits 0
++  in 9.2s (pre-change scan of the same list, dominated by 1.8GB of tracked
++  `.factory` model weights, had not completed after >2 minutes), the repo lint
++  runner's detect-secrets step PASSES, a planted control secret still exits 1,
++  the unit suite is green, and the full 14-tool lint gate exits 0."
++target:
++  command: uv run pytest -q
++  customTarget: true
++evidence:
++  - "Pre-validated filter schema against installed detect-secrets 1.5.0:
++    `inspect.signature(detect_secrets.filters.regex.should_exclude_file)` ->
++    `(filename: str) -> bool`; source shows `_get_file_exclusion_regex`
++    iterating `get_settings().filters[path]['pattern']`, and `--exclude-files`
++    argparse collects a list, so inserted `{\"path\":
++    \"detect_secrets.filters.regex.should_exclude_file\", \"pattern\":
++    [\"^\\\\.factory/\"]}` (list form, version-correct)."
++  - "Behavioral proof of the configured filter via detect_secrets API:
++    `configure_settings_from_baseline(json.load('.secrets.baseline'))` then
++    `should_exclude_file('.factory/project.yaml') is True`,
++    `should_exclude_file('.factory/tasks/modernize/journal.ndjson') is True`,
++    `should_exclude_file('src/python_setup_lint/runner/cli.py') is False`,
++    `should_exclude_file('docs/factory.md') is False`."
++  - "Full tracked-file scan after change: `git ls-files -z | xargs -0 uv run
++    detect-secrets-hook --baseline .secrets.baseline` -> exit 0 in 9.2s (859
++    tracked files)."
++  - Pre-change control on the same tracked list (launched before the edit, same
++    command) had not completed after >2 minutes and was stopped at ~3 minutes,
++    consistent with the runner's 120s/tool cap failure caused by 1.8GB of
++    tracked `.factory` model weights (10 tracked .safetensors); post-change
++    completes in 9.2s. Mechanism evidence, not finding counts.
++  - "Planted control secret: wrote `.tmp-control-secret.txt` with an AWS-style
++    access key and secret; `uv run detect-secrets-hook --baseline
++    .secrets.baseline .tmp-control-secret.txt` -> exit 1 (AWS Access Key, Base64
++    High Entropy String, Secret Keyword); file deleted immediately after and
++    `git status --porcelain` confirms no residue."
++  - "Runner integration: `uv run lint --tools detect-secrets` ->
++    `[detect-secrets] PASSED [11.1s]`, exit 0."
++  - "Unit tests: `uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected,
++    exit 0 in 43.27s."
++  - "Full project gate: `uv run lint` -> LINT_EXIT=0 in 85s; detect-secrets
++    PASSED 11.6s, all 14 tools passed."
++  - "JSON validity and diff hygiene: `python3 -m json.tool .secrets.baseline` ->
++    valid; `git diff --stat` -> `.secrets.baseline | 6 ++++++` (only intended
++    6-line insertion, sorted filter order retained); `git status --porcelain` ->
++    ` M .secrets.baseline` only, i.e. zero test-diff and no semantic assertion
++    changes; `.factory` journals remain committed."
++concerns:
++  - "Residual risk: this is a write-time/scan-time exclusion, not prevention.
++    Secrets placed under `.factory/` will no longer be caught by the standard
++    gate and remain committed. Mitigation: periodic unfiltered audits (e.g. run
++    detect-secrets-hook with `--disable-filter
++    detect_secrets.filters.regex.should_exclude_file`, or a scan without the
++    baseline filter) and keep the caveat in the M1 report."
++  - The `.factory` tree contains ~1.8GB of tracked model weights (10
++    `.safetensors`), making the unfiltered scan exceed the 120s per-tool cap;
++    the exclusion is load-bearing for gate runtime, not just noise suppression.
++  - No automated test asserts the baseline filter entry; verification is
++    mechanism-based (API predicate + hook exit codes), as appropriate for a
++    no-behavior config-only change.
++notes: "Final HEAD pinned for M1 citation:
++  b4f45b2100de43ed44acbef1ac5a0704622d535a. Only `.secrets.baseline` changed (6
++  insertions). Zero git write commands were issued."
+diff --git a/.secrets.baseline b/.secrets.baseline
+index 4684056..64f5f67 100644
+--- a/.secrets.baseline
++++ b/.secrets.baseline
+@@ -37,6 +37,12 @@
+     },
+     {
+       "path": "detect_secrets.filters.heuristic.is_templated_secret"
++    },
++    {
++      "path": "detect_secrets.filters.regex.should_exclude_file",
++      "pattern": [
++        "^\\.factory/"
++      ]
+     }
+   ],
+   "plugins_used": [
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
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..6afd3ca
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T20:21:37.281Z
+session: 01a1bcd2-dbab-762a-96ca-881f4568beee
+endedAt: 2026-11-08T20:27:22.751Z
+usage:
+  inputTokens: 40054
+  outputTokens: 35091
+  costUsd: 0.012735
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T20-21-37-835Z_01a1bcd2-dbab-762a-96ca-881f4568beee.jsonl
diff --git a/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..b570850
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-baseline-exclusion/steps/002-qa-r1-a1/output.yaml
@@ -0,0 +1,29 @@
+status: approved
+summary: "approved: no-behavior exclusion verified, zero test diff, full scan
+  exit 0, controls replicate"
+suggestions:
+  - detail: Developer's notes pin HEAD b4f45b2 for M1 citation, but that commit's
+      .secrets.baseline lacks the should_exclude_file entry (verified via git
+      show) and it is not an ancestor of HEAD (sibling of landed 882fac0 under
+      parent 3f2f546). M1 acceptance (mechanism + pinned HEAD) should cite
+      landed commit 882fac0 or final HEAD whose baseline contains the filter. No
+      code change needed; correct the citation in the M1 report.
+    disposition: optional
+    id: m1-head-citation-nit
+    summary: M1 report cites session HEAD lacking filter; cite landed commit instead
+  - detail: "Pattern ^\\.factory/ matches bare repo-relative paths (git ls-files
+      form used by the gate: dispatch.py builds `git ls-files -z | xargs -0
+      detect-secrets-hook --baseline ...`), verified: full tracked-file scan
+      exit 0 in 7.3s, bare .factory control exit 0. Explicit ./-prefixed args
+      (./.factory/file) do NOT match and still exit 1. No action required:
+      assignment mandates this exact operator-approved form and the gate's
+      invocation form is bare. Only if invocation forms diversify
+      (pre-commit/manual ./ args), consider a prefix-tolerant form in a future
+      item."
+    disposition: optional
+    id: pattern-prefix-sensitivity-note
+    location:
+      file: .secrets.baseline
+      line: 44
+    summary: Pattern matches bare gate paths only; ./ prefix bypasses (gate form
+      verified, no action)
diff --git a/.secrets.baseline b/.secrets.baseline
index 4684056..64f5f67 100644
--- a/.secrets.baseline
+++ b/.secrets.baseline
@@ -37,6 +37,12 @@
     },
     {
       "path": "detect_secrets.filters.heuristic.is_templated_secret"
+    },
+    {
+      "path": "detect_secrets.filters.regex.should_exclude_file",
+      "pattern": [
+        "^\\.factory/"
+      ]
     }
   ],
   "plugins_used": [

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
