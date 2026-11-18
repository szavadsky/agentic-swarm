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
  "slug": "decision-runtime-pinning",
  "kind": "test-assumptions",
  "title": "Pin chosen runtime wheels and API contracts",
  "assignment": "GOAL: Pin chosen runtime wheels and API contracts conditional on eval recommendation. Conditional: no-go from model-eval-poc means report-only skip with no file. STEPS: For chosen runtime only verify py3.14 CPU wheels for linux,mac,win, import and device and offline contract (CPU fallback, no network on hit), and custom-code pinning (vendored revision, never unpinned trust_remote_code). Add tests/assumptions/test_decision_runtime_contracts.py with no_external_api marker and test_<api>_given_<condition>_then_<expected> names. No src changes. VERIFY: New assumption tests pass offline or explicit blocker recorded for iteration-3 epic; wheels and APIs pinned.",
  "outlineRef": "decision-runtime-pinning",
  "milestone": "M3",
  "wave": 3,
  "deps": [
    "model-eval-poc"
  ],
  "scenarioRefs": [
    "M3-1"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:93-122",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "pyproject.toml:28-31",
    "docs/semantic-justification.md:5-14"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..d5cf795
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/checks.yaml
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
+        durationMs: 344
+        details: 181 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 417428
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.5s]
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
+          [rumdl check] PASSED [0.1s]
+          ============================================================
+
+          Success: No issues found in 20 files (27ms)
+
+          ============================================================
+          [mypy] PASSED [8.4s]
+          ============================================================
+          Success: no issues found in 56 source files
+
+          ============================================================
+          [yamllint] PASSED [0.3s]
+          ============================================================
+
+          ============================================================
+          [ty check] PASSED [0.3s]
+          ============================================================
+          All checks passed!
+
+          ============================================================
+          [mypy.stubtest] PASSED [14.9s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [7.2s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794151820869",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 110,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 6.402
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [1.7s]
+          ============================================================
+            pyright verify types: completenessScore=1
+
+          ============================================================
+          [pylint] PASSED [18.8s]
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
+          [pylint-pyi] PASSED [16.7s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [23.2s]
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
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-runtime-pinning/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 56607
+        details: |-
+          [Tach] 1379 tests in 59 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-runtime-pinning/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-runtime-pinning/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-runtime-pinning/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1357 passed, 4 skipped, 18 deselected, 4 warnings in 52.90s
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
+        durationMs: 101692
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 100.18s (0:01:40)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (0 test files changed)
diff --git a/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..9b87be4
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,58 @@
+# Step: Test Assumptions
+
+## Goal
+Author permanent automated tests that explicitly verify third-party library behavior, runtime assumptions, and interface contract guarantees.
+
+## Rules
+- Permanent tests: write tests into `paths.tests` designed to stay in the repository. Do NOT write temporary or throwaway tests.
+- Assumption validation: test boundary behaviors, edge conditions, return value contracts, and exception types that subsequent code will rely upon.
+- Test infra first: verify failure detection. Prove tests fail when assumptions are violated.
+- Verification: run tests via `bash` using project test runner; ensure tests pass cleanly on current environment.
+- Output: yield structured output per `developer-output.schema.json` (`status: ok` with executed verification in `evidence`).
+- Fix-round re-entry: when `Review Feedback` below is non-empty, address ONLY the listed concerns with targeted follow-up work; do NOT regenerate the suite from scratch.
+
+## Assignment
+{
+  "slug": "decision-runtime-pinning",
+  "kind": "test-assumptions",
+  "title": "Pin chosen runtime wheels and API contracts",
+  "assignment": "GOAL: Pin chosen runtime wheels and API contracts conditional on eval recommendation. Conditional: no-go from model-eval-poc means report-only skip with no file. STEPS: For chosen runtime only verify py3.14 CPU wheels for linux,mac,win, import and device and offline contract (CPU fallback, no network on hit), and custom-code pinning (vendored revision, never unpinned trust_remote_code). Add tests/assumptions/test_decision_runtime_contracts.py with no_external_api marker and test_<api>_given_<condition>_then_<expected> names. No src changes. VERIFY: New assumption tests pass offline or explicit blocker recorded for iteration-3 epic; wheels and APIs pinned.",
+  "outlineRef": "decision-runtime-pinning",
+  "milestone": "M3",
+  "wave": 3,
+  "deps": [
+    "model-eval-poc"
+  ],
+  "scenarioRefs": [
+    "M3-1"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:37-52",
+    "pyproject.toml:28-31",
+    "docs/semantic-justification.md:5-14"
+  ]
+}
+
+## Context
+
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
diff --git a/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..9d0bf31
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T15:24:35.455Z
+session: 01a1bbc3-ae05-755a-908d-bc7f10da3b48
+endedAt: 2026-11-08T15:36:00.142Z
+usage:
+  inputTokens: 36452
+  outputTokens: 5678
+  costUsd: 0.010102
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T15-25-25-893Z_01a1bbc3-ae05-755a-908d-bc7f10da3b48
diff --git a/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..a22ab99
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-runtime-pinning/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,47 @@
+status: ok
+summary: "Conditional no-go branch executed as a report-only skip:
+  model-eval-poc's final verdict is no-go (no runtime chosen,
+  smallest_compliant=null), so no
+  tests/assumptions/test_decision_runtime_contracts.py was added and no src/test
+  files were changed. Existing offline assumption suite remains green (8
+  passed)."
+target:
+  command: test ! -e tests/assumptions/test_decision_runtime_contracts.py && uv
+    run pytest tests/assumptions -q
+  customTarget: true
+evidence:
+  - Read .factory/tasks/modernize/items/model-eval-poc/poc/report.md:7-11 —
+    verdict is 'No-go for the contracted evaluation'; the contracted
+    heuristic-accepted stratum has 215 meaningful / 0 meaningless items, so the
+    precision bar cannot be evaluated, and the augmented sensitivity analysis
+    also finds no compliant eligible candidate.
+  - Read
+    .factory/tasks/modernize/items/model-eval-poc/steps/003-develop-r2-a1/output.yaml:16,45
+    — developer records 'formal recommendation is no-go' and '0
+    contracted-compliant, 0 augmented-compliant, smallest_compliant = null';
+    final review step 006-r1-a1 output is status approved with no verdict
+    change.
+  - Confirmed the conditional skip condition in
+    .factory/tasks/modernize/plan/plan-2.1.yaml:437-446 — 'Conditional on eval
+    recommendation (no-go -> report-only skip, no file)'; no chosen runtime
+    exists to pin wheels, device/offline behavior, or custom-code revisions
+    against.
+  - test -e tests/assumptions/test_decision_runtime_contracts.py -> ABSENT;
+    tests/assumptions contains only the pre-existing astroid/beartype/pylint
+    contract tests.
+  - git status --porcelain -> 0 lines (clean worktree; no src, test, config, or
+    dependency changes made by this step).
+  - uv run pytest tests/assumptions -q -> 8 passed in 2.07s (existing offline
+    assumption contract suite green).
+concerns:
+  - No wheels/APIs are pinned by design because the underlying runtime decision
+    is no-go; the iteration-3 semantic epic must re-run decision-runtime-pinning
+    only if a future eval reverses the verdict.
+  - The no-go is structural (zero heuristic-accepted negative examples in the
+    contracted corpus, single-adjudicator repo labels) rather than a clean
+    model-quality rejection; a future go/no-go needs an independent,
+    double-rated negative sample.
+notes: Per the assignment's explicit conditional ('no-go from model-eval-poc
+  means report-only skip with no file'), this step intentionally produces no
+  repository artifact. The worktree was left untouched; this yield is the
+  required report.

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
