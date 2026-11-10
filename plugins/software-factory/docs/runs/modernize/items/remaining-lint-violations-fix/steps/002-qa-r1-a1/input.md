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
  "slug": "remaining-lint-violations-fix",
  "kind": "no-behavior",
  "title": "Fix remaining src/tests lint violations (W9704 tail)",
  "assignment": "Close M1 green-baseline W9704 tail (no-behavior, red-test-exempt). Context: baseline-violations-fix (merged) fixed SIM102/R0914/C0208; lint stays red on 2 W9704 sites never owned by any item (TD2-B2 omitted them). Depends on baseline-violations-fix — start from HEAD containing it; no other deps.\n\nScope: (1) src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site; (2) src/python_setup_lint/testing.py list[Any]/type-ignore site. If reproduction surfaces additional src/** or tests/** violations, fix ONLY if trivially behavior-preserving (justification-comment strengthening); else record as debt in report — do not balloon scope.\n\nSteps: 1) Reproduce via declared split gates (format check + lint gate check-only without --fix) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations (tool, file:line, rule). 2) Fix with justification-comment-only edits (no logic/config changes) so check_if_meaningful accepts. 3) Verify.\n\nFORBIDDEN: lint.baseline edits (stays []); tests/data/** changes; golden regen; unrelated refactors; .secrets.baseline; writes outside repo.\n\nSecrets-triage verdict is human-async and out of scope.\n\nVerify: lint gate zero violations in src/** and tests/**; `uv run pytest -q` no new failures; `uv run pytest tests/integration.py -v` no new failures; golden+counts byte-identical; touched files format-clean (ruff format --check with shipped config). Report before/after violation list + per-file disposition + any deferred debt.",
  "outlineRef": "remaining-lint-violations-fix",
  "milestone": "M1",
  "wave": 3,
  "deps": [
    "baseline-violations-fix"
  ],
  "scenarioRefs": [
    "M1: Gates green per-gate"
  ],
  "citations": [
    "src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py",
    "src/python_setup_lint/testing.py"
  ]
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..17cb6e2
--- /dev/null
+++ b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,208 @@
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
+        durationMs: 272
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 353254
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
+          Success: No issues found in 20 files (17ms)
+
+          ============================================================
+          [mypy] PASSED [5.5s]
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
+          [mypy.stubtest] PASSED [8.1s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [4.6s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794152416548",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 4.126
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.1s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [10.7s]
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
+          [pylint-pyi] PASSED [12.9s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [19.5s]
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
+          [detect-secrets] FAILED (exit=124) [120.1s]
+          ============================================================
+          Command timed out: ['bash', '-c', 'git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline && python3 -c "import json,sys; p=sys.argv[1]; d=json.load(open(p)); d.pop(\'generated_at\',None); json.dump(d,open(p,\'w\'),indent=2,sort_keys=True)" .secrets.baseline']
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--remaining-lint-violations-fix/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 38281
+        details: |-
+          [Tach] 1379 tests in 59 files unaffected by changes (~42.8s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--remaining-lint-violations-fix/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--remaining-lint-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--remaining-lint-violations-fix/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1357 passed, 4 skipped, 18 deselected, 4 warnings in 36.01s
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
+        durationMs: 74516
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 49s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 73.40s (0:01:13)
+  - id: size
+    status: pass
+    message: "size passed: 8/300 production lines changed"
+    details:
+      changedLines:
+        added: 4
+        deleted: 4
+        total: 8
+        files:
+          - src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
+          - src/python_setup_lint/checkers/conformance/generic_key_dict_checker.pyi
+          - src/python_setup_lint/testing.py
+          - src/python_setup_lint/testing.pyi
+      limit: 300
diff --git a/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..6230836
--- /dev/null
+++ b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,61 @@
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
+  "slug": "remaining-lint-violations-fix",
+  "kind": "no-behavior",
+  "title": "Fix remaining src/tests lint violations (W9704 tail)",
+  "assignment": "Close M1 green-baseline W9704 tail (no-behavior, red-test-exempt). Context: baseline-violations-fix (merged) fixed SIM102/R0914/C0208; lint stays red on 2 W9704 sites never owned by any item (TD2-B2 omitted them). Depends on baseline-violations-fix — start from HEAD containing it; no other deps.\n\nScope: (1) src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site; (2) src/python_setup_lint/testing.py list[Any]/type-ignore site. If reproduction surfaces additional src/** or tests/** violations, fix ONLY if trivially behavior-preserving (justification-comment strengthening); else record as debt in report — do not balloon scope.\n\nSteps: 1) Reproduce via declared split gates (format check + lint gate check-only without --fix) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations (tool, file:line, rule). 2) Fix with justification-comment-only edits (no logic/config changes) so check_if_meaningful accepts. 3) Verify.\n\nFORBIDDEN: lint.baseline edits (stays []); tests/data/** changes; golden regen; unrelated refactors; .secrets.baseline; writes outside repo.\n\nSecrets-triage verdict is human-async and out of scope.\n\nVerify: lint gate zero violations in src/** and tests/**; `uv run pytest -q` no new failures; `uv run pytest tests/integration.py -v` no new failures; golden+counts byte-identical; touched files format-clean (ruff format --check with shipped config). Report before/after violation list + per-file disposition + any deferred debt.",
+  "outlineRef": "remaining-lint-violations-fix",
+  "milestone": "M1",
+  "wave": 3,
+  "deps": [
+    "baseline-violations-fix"
+  ],
+  "scenarioRefs": [
+    "M1: Gates green per-gate"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py",
+    "src/python_setup_lint/testing.py"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py",
+  "src/python_setup_lint/testing.py"
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
diff --git a/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..9e2aa7a
--- /dev/null
+++ b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/meta.yaml
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
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T15:25:25.276Z
+session: 01a1bbc3-b105-7249-a2e6-a2951cabffee
+endedAt: 2026-11-08T15:44:53.828Z
+usage:
+  inputTokens: 79449
+  outputTokens: 31784
+  costUsd: 0.040511
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T15-25-26-661Z_01a1bbc3-b105-7249-a2e6-a2951cabffee.jsonl
diff --git a/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..cf5c6e6
--- /dev/null
+++ b/.factory/tasks/modernize/items/remaining-lint-violations-fix/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,70 @@
+status: ok
+summary: "Hardened the two W9704 Any-justification sites named by the assignment
+  with comment-only edits (no logic/config/test/golden changes): options-Any in
+  generic_key_dict_checker.py/.pyi and list[Any] return in testing.py/.pyi. The
+  recorded M1 baseline (infra.yaml) listed W9704 at
+  generic_key_dict_checker.py:40 and testing.py:34; in this worktree the
+  heuristic W9704 path already accepts the old trailing comments (optional
+  sentence-transformers extra is not installed), so reproduction confirmed the
+  sites are green locally while the new code-specific wording targets the
+  semantic-reranker path. All declared check-only lint tools pass with zero
+  pylint/pylint-pyi/pylint-tests messages, format is clean,
+  unit/integration/golden suites pass, and lint.baseline stays []."
+target:
+  command: uv run pytest -q
+  customTarget: true
+evidence:
+  - "Reproduction/current state: `uv run lint --tools 'pylint,pylint-pyi,pylint
+    tests'` reports PASSED with `\"messages\": []` for all three pylint passes
+    (zero W9704); the historic red sites are recorded in
+    .factory/tasks/modernize/infra.yaml (generic_key_dict_checker.py:40 and
+    testing.py:34). Local env lacks optional sentence-transformers, so W9704
+    exercises the heuristic fallback; new comments are more code-specific for
+    the reranker path."
+  - "Format gate: `uv run ruff format --check --config config/ruff.toml src
+    tests` -> '181 files already formatted' (exit 0); touched-file check after
+    edits also clean."
+  - "Lint gate (declared 13 check-only tools minus out-of-scope detect-secrets):
+    `uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+    check,mypy.stubtest,pyright check,pyright verify
+    types,pylint,pylint-pyi,pylint tests'` -> all PASSED; pylint, pylint-pyi,
+    pylint tests each emitted zero messages."
+  - "Unit tests: `uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected, 0
+    failed."
+  - "Integration tests: `uv run pytest tests/integration.py -v` -> 9 passed
+    (install/lint/update/parity scenarios)."
+  - "Golden + real pipeline: `uv run pytest tests/test_golden.py
+    tests/runner/test_real_pipeline_smoke.py -q` -> 32 passed; `git status
+    --short` shows no tests/data or golden changes."
+  - "Checker-focused tests: `uv run pytest tests/checkers/test_semantic_check.py
+    tests/checkers/test_suppression_justification_checker.py -q` -> 118 passed,
+    4 skipped, 5 deselected."
+  - "Secrets scan in product scope: `git ls-files -z -- src tests config | xargs
+    -0 uv run detect-secrets-hook --baseline .secrets.baseline` -> exit 0.
+    Full-tree scan reports only .factory orchestration records (out of scope)
+    and exceeds the runner's 120s/tool cap."
+  - "Diff scope: 4 files, 4 insertions/4 deletions, comment text only;
+    `lint.baseline` remains `[]`; `git diff --check` exit 0."
+concerns:
+  - "The assignment's red state is not reproducible in this worktree's
+    verification environment: sentence-transformers (the optional `semantic`
+    extra) is absent, so W9704 uses the heuristic fallback which accepted the
+    pre-existing comments. The strengthened wording therefore cannot be
+    machine-validated against the cross-encoder (score >= 0.5) without a heavy
+    optional install/model download."
+  - Matching .pyi mirror sites (generic_key_dict_checker.pyi:13, testing.pyi:42)
+    were also strengthened because pylint-pyi applies the same W9704 Any check
+    to stubs and they carried the identical weak justification; this is
+    trivially behavior-preserving (comments only) and within the 'additional
+    src/** violations' allowance.
+  - Full detect-secrets gate cannot complete under the runner's 120s cap because
+    tracked .factory orchestration records are ~1.8GB; prior step also recorded
+    only .factory findings there. Secrets triage remains human-async/out of
+    scope per assignment.
+notes: "Per-file disposition: generic_key_dict_checker.py:38 options-Any
+  trailing justification strengthened; generic_key_dict_checker.pyi:13 mirrored;
+  testing.py:32 list[Any] return justification strengthened; testing.pyi:42
+  mirrored. testing.py:38 `# type: ignore[return-value]` was reviewed and left
+  unchanged (its existing reason is already technical and format-clean). No
+  tests were added because the item is kind=no-behavior/red-test-exempt;
+  behavior is unchanged by comment-only edits."
diff --git a/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py b/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
index 9cdb635..0f89294 100644
--- a/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
+++ b/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
@@ -35,7 +35,7 @@ class GenericKeyDictChecker(BaseChecker):
             "Use 'allow-string-keys-for' config to suppress for legitimate categories.",
         ),
     )
-    options: tuple[tuple[str, dict[str, Any]], ...] = (  # pylint option dict values are Any by API contract
+    options: tuple[tuple[str, dict[str, Any]], ...] = (  # pylint option values are heterogeneous; Any matches the API contract
         (
             "allow-string-keys-for",
             {
diff --git a/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.pyi b/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.pyi
index 2f14501..355e89d 100644
--- a/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.pyi
+++ b/src/python_setup_lint/checkers/conformance/generic_key_dict_checker.pyi
@@ -10,7 +10,7 @@ from pylint.typing import MessageDefinitionTuple
 class GenericKeyDictChecker(BaseChecker):
     name: str = "generic-key-dict"
     msgs: dict[str, MessageDefinitionTuple]
-    options: tuple[tuple[str, dict[str, Any]], ...]  # pylint option dict values are Any by API contract
+    options: tuple[tuple[str, dict[str, Any]], ...]  # pylint option values are heterogeneous; Any matches the API contract
 
     def __init__(self, linter: PyLinter) -> None: ...
     def open(self) -> None: ...
diff --git a/src/python_setup_lint/testing.py b/src/python_setup_lint/testing.py
index 3dd2295..4f5065c 100644
--- a/src/python_setup_lint/testing.py
+++ b/src/python_setup_lint/testing.py
@@ -29,7 +29,7 @@ def _walk_and_release(
     *,
     file_path: str | None = None,
     module_name: str = "",
-) -> list[Any]:  # released pylint messages are dynamically typed; Any is the accurate contract
+) -> list[Any]:  # release_messages() builds dynamic MessageTest objects; runtime-only .msg_id/.args require Any
     tc = _make_tc(checker_class)
     module = astroid.parse(code, module_name=module_name)
     if file_path is not None:
diff --git a/src/python_setup_lint/testing.pyi b/src/python_setup_lint/testing.pyi
index 1e4b022..0b2003c 100644
--- a/src/python_setup_lint/testing.pyi
+++ b/src/python_setup_lint/testing.pyi
@@ -39,7 +39,7 @@ def _walk_and_release(
     *,
     file_path: str | None = None,
     module_name: str = "",
-) -> list[Any]:  # released pylint messages are dynamically typed; Any is the accurate contract
+) -> list[Any]:  # release_messages() builds dynamic MessageTest objects; runtime-only .msg_id/.args require Any
     """Parse *code*, walk *checker_class* over it, return released messages.
 
     Optionally set *file_path* for path-dependent logic (source-roots,

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
