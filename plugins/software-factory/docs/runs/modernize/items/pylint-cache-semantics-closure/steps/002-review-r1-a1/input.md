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
  "slug": "pylint-cache-semantics-closure",
  "kind": "test-assumptions",
  "title": "Land or verify pylint writer/timing verdict",
  "assignment": "Close iteration-2 M3 gap (test-assumptions: permanent tests in paths.tests asserting assumptions; review checks validity; offline, no src writes). If tests/assumptions/test_pylint_cache_semantics.py already merged at HEAD, verify verdict exists and is readable and report location; else land EXACTLY ONE new file at that path (no_external_api, test_<api>_given_<condition>_then_<expected>, offline, no src writes). Writer-first verdict must pin writer identity + timing + --path scoping (crash-safe lock vs runner post-merge vs jobs=1/sidecars-if--j). Verdict is consumed by epic-semantic-infrastructure cache concurrency (epic must not invent semantics). Covers U3/TD3-I1 and ADR-010 writer-first input.",
  "outlineRef": "pylint-cache-semantics-closure",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Epic kickoff gated on validated artifacts"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "docs/semantic-justification.md:34-45",
    "docs/semantic-justification.md:56-62",
    "pyproject.toml:49-49",
    "CodingRules.md:230-306"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..fa95f47
--- /dev/null
+++ b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,154 @@
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
+        durationMs: 254
+        details: 182 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 347356
+        details: |-
+          n
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
+          Success: No issues found in 23 files (18ms)
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
+          [mypy.stubtest] PASSED [7.4s]
+          ===
+          ... [truncated 1880 bytes] ...
+          ==========================
+          [detect-secrets] FAILED (exit=123) [114.8s]
+          ============================================================
+          Traceback (most recent call last):
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/bin/detect-secrets-hook", line 10, in <module>
+              sys.exit(main())
+                       ~~~~^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/pre_commit_hook.py", line 30, in main
+              secrets.scan_file(filename)
+              ~~~~~~~~~~~~~~~~~^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/core/secrets_collection.py", line 76, in scan_file
+              for secret in scan.scan_file(os.path.join(self.root, convert_local_os_path(filename))):
+                            ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 154, in scan_file
+              for lines in _get_lines_from_file(filename):
+                           ~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py", line 265, in _get_lines_from_file
+              lines = get_transformed_file(cast(NamedIO, f))
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/transformers/__init__.py", line 31, in get_transformed_file
+              return transformer.parse_file(file)
+                     ~~~~~~~~~~~~~~~~~~~~~~^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 24, in parse_file
+              return _parse_file(file)
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 49, in _parse_file
+              for key, value, line_number in IniFileParser(file, add_header=add_header):
+                                             ~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
+            File "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/.venv/lib/python3.14/site-packages/detect_secrets/transformers/config.py", line 97, in __init__
+              content = file.read()
+            File "<frozen codecs>", line 325, in decode
+          MemoryError
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 33854
+        details: |-
+          [Tach] 1394 tests in 60 files unaffected by changes (~25.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ........................................................................ [ 15%]
+          .............ssss....................................................... [ 20%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 31%]
+          ........................................................................ [ 36%]
+          ........................................................................ [ 41%]
+          ........................................................................ [ 47%]
+          ........................................................................ [ 52%]
+          ........................................................................ [ 57%]
+          ........................................................................ [ 62%]
+          ........................................................................ [ 68%]
+          ........................................................................ [ 73%]
+          ........................................................................ [ 78%]
+          ........................................................................ [ 83%]
+          ........................................................................ [ 88%]
+          ........................................................................ [ 94%]
+          ........................................................................ [ 99%]
+          ........                                                                 [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--pylint-cache-semantics-closure/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1372 passed, 4 skipped, 18 deselected, 4 warnings in 31.83s
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
+        durationMs: 66255
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 65.18s (0:01:05)
+  - id: tests-only
+    status: pass
+    message: tests-only passed (1 test files changed)
diff --git a/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..f04052e
--- /dev/null
+++ b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,56 @@
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
+  "slug": "pylint-cache-semantics-closure",
+  "kind": "test-assumptions",
+  "title": "Land or verify pylint writer/timing verdict",
+  "assignment": "Close iteration-2 M3 gap (test-assumptions: permanent tests in paths.tests asserting assumptions; review checks validity; offline, no src writes). If tests/assumptions/test_pylint_cache_semantics.py already merged at HEAD, verify verdict exists and is readable and report location; else land EXACTLY ONE new file at that path (no_external_api, test_<api>_given_<condition>_then_<expected>, offline, no src writes). Writer-first verdict must pin writer identity + timing + --path scoping (crash-safe lock vs runner post-merge vs jobs=1/sidecars-if--j). Verdict is consumed by epic-semantic-infrastructure cache concurrency (epic must not invent semantics). Covers U3/TD3-I1 and ADR-010 writer-first input.",
+  "outlineRef": "pylint-cache-semantics-closure",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1: Epic kickoff gated on validated artifacts"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:37-52",
+    "docs/semantic-justification.md:34-45",
+    "docs/semantic-justification.md:56-62",
+    "pyproject.toml:49-49",
+    "CodingRules.md:230-306"
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
diff --git a/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..8742077
--- /dev/null
+++ b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T19:54:59.659Z
+session: 01a1bcbb-006a-7502-8ced-87ae010636ba
+endedAt: 2026-11-08T20:21:34.390Z
+usage:
+  inputTokens: 160140
+  outputTokens: 77150
+  costUsd: 0.09395
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T19-55-34-378Z_01a1bcbb-006a-7502-8ced-87ae010636ba
diff --git a/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..6591e17
--- /dev/null
+++ b/.factory/tasks/modernize/items/pylint-cache-semantics-closure/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,73 @@
+status: ok
+summary: "Target file tests/assumptions/test_pylint_cache_semantics.py was
+  absent at HEAD, so landed EXACTLY ONE new permanent assumption/verdict file
+  there (no src writes, no other repo diffs). It pins the writer-first verdict
+  consumed by cache-design-spike/epic-semantic-infrastructure: (1) writer
+  identity = the checker call path
+  (python_setup_lint.checkers._semantic.semantic_check_if_meaningful ->
+  _save_result_cache) inside each pylint subprocess; runner performs no
+  post-process merge and checker open/close hooks do not write; (2) timing =
+  immediate whole-file rewrite per newly computed verdict/cache miss, while hits
+  and heuristic fallback (reranker unavailable) write nothing; (3) --path
+  scoping = runner --path narrows lint file targets only; the cache is a single
+  ~/.cache/python-setup/semantic/results.json and the key is SHA-256 over (text,
+  rule, code_context, comment, model) with no path component, so scoped/full
+  runs share entries across the sequential pylint, pylint-pyi, pylint tests
+  invocations; sweep scope must come from per-entry file references, not --path;
+  (4) concurrency decision = sequential runner + no -j/--jobs in any pylint spec
+  + pylint default jobs=1 => single writer, so no lockfile, no runner merge, no
+  sidecars today; if -j is introduced pylint dispatches separate process workers
+  and the verdict flips to per-writer sidecars + merge (or crash-safe lock +
+  atomic replace); (5) crash safety = non-atomic write, but truncated/corrupt
+  JSON loads as empty and is recomputed. 15 tests pass offline with the
+  no_external_api marker and test_<api>_given_<condition>_then_<expected>
+  names."
+target:
+  command: uv run pytest tests/assumptions/test_pylint_cache_semantics.py -q
+  customTarget: true
+evidence:
+  - git status --porcelain=v1 => only '??
+    tests/assumptions/test_pylint_cache_semantics.py'; git diff --stat empty; no
+    src, tests/runner, or .secrets.baseline changes
+  - uv run pytest tests/assumptions/test_pylint_cache_semantics.py -q => 15
+    passed
+  - uv run pytest tests/assumptions/ -q => 23 passed
+  - uv run pytest -q (serial) => 1372 passed, 4 skipped, 18 deselected, 4
+    warnings
+  - uv run ruff check --config config/ruff.toml
+    tests/assumptions/test_pylint_cache_semantics.py => All checks passed
+  - uv run ruff format --config config/ruff.toml --check
+    tests/assumptions/test_pylint_cache_semantics.py => 1 file already formatted
+  - uv run pylint --rcfile config/.pylintrc-tests
+    tests/assumptions/test_pylint_cache_semantics.py => exit 0, zero messages,
+    score 10.0
+  - uv run detect-secrets scan tests/assumptions/test_pylint_cache_semantics.py
+    => results {}, 0 findings; .secrets.baseline not rewritten/touched
+  - "Negative controls prove failure detection: no-op _save_result_cache =>
+    writer/timing test fails (FileNotFoundError); patched PyLinter default
+    jobs=2 => jobs=1 test fails (AssertionError); cache path redirected under
+    cwd => single-home-location test fails (AssertionError)"
+  - "Offline verification: fake reranker is injected, sentence-transformers is
+    absent, no subprocesses are spawned (pylint check_parallel is
+    monkeypatched), and all cache I/O is redirected to pytest tmp_path"
+concerns:
+  - The verdict is pinned to the current HEAD writer implementation; if the
+    writer moves (e.g., runner post-merge, checker close hook) or -j is
+    introduced, watchdog tests fail intentionally and the verdict must be
+    re-derived rather than loosening assertions (stated in the module
+    docstring).
+  - One earlier full-suite run executed concurrently with separate
+    pylint/detect-secrets commands showed a transient unrelated failure in
+    tests/runner/test_t5_compose_ruff.py (ruff.toml/shared_ruff.toml diff); two
+    serial full-suite reruns and three isolated runs of that file all passed.
+  - One source-scan test reads src AST/text to pin the single _save_result_cache
+    call site and the absence of runner-side cache writes; this is deliberate
+    contract brittleness, not behavioral redundancy.
+notes: "File landed at tests/assumptions/test_pylint_cache_semantics.py; the
+  verdict is readable in its module docstring (WRITER-FIRST VERDICT section).
+  Downstream consumers should read that docstring; no separate report file was
+  created because the item contract allows exactly one new file and no src/docs
+  writes. Recommended cache-design-spike input: no lock / no runner post-merge /
+  no sidecars at jobs=1; keep the sequential single-writer assumption, and
+  revisit with per-worker sidecars + merge (or lock + atomic replace) only if
+  pylint -j is enabled."
diff --git a/tests/assumptions/test_pylint_cache_semantics.py b/tests/assumptions/test_pylint_cache_semantics.py
new file mode 100644
index 0000000..6132577
--- /dev/null
+++ b/tests/assumptions/test_pylint_cache_semantics.py
@@ -0,0 +1,378 @@
+"""Pin the writer, timing, and ``--path`` scoping of the cache written during pylint runs.
+
+Observed at HEAD with pylint 4.0.6 (pinned in ``pyproject.toml``).  The tracked
+cache in this verdict is the semantic result cache consumed by
+``epic-semantic-infrastructure`` -- not pylint's separate persistent
+``~/.cache/pylint/*.stats`` bookkeeping.
+
+WRITER-FIRST VERDICT (feeds ``cache-design-spike``)
+===================================================
+* **Writer identity** -- the checker call path writes the cache while pylint is
+  linting: ``python_setup_lint.checkers._semantic.semantic_check_if_meaningful``
+  calls ``_save_result_cache``.  The runner performs no post-process merge and
+  checker ``open()``/``close()`` hooks do not write the file.
+* **Timing** -- one whole-file rewrite per newly computed verdict (cache miss),
+  synchronously before the check returns.  Cache hits and heuristic fallbacks
+  (reranker unavailable) write nothing.
+* **``--path`` scoping** -- the runner's ``--path`` narrows only the file
+  arguments passed to each pylint invocation.  The cache is a single
+  home-directory file and the key is SHA-256 over
+  ``(text, rule, code_context, comment, model)``: no file path participates, so
+  scoped and full runs share entries across the sequential ``pylint``,
+  ``pylint-pyi`` and ``pylint tests`` invocations.
+* **Sweep implication** -- because cache identity is path-free, ``--path``
+  cannot partition the cache.  Prune/sweep scope must come from per-entry file
+  references (the tracked schema's ``files`` field), not from the lint
+  invocation's path argument.
+* **Concurrency** -- the runner executes tools sequentially and none of the
+  three pylint specs passes ``-j``/``--jobs``; pylint's default ``jobs`` is 1,
+  so each run has a single writer.  No lockfile, runner-side merge, or sidecar
+  files are required today.  If ``-j`` is introduced, pylint dispatches workers
+  as separate processes, and the verdict flips to per-writer sidecars plus a
+  runner merge (or a crash-safe lock plus atomic replace).
+* **Crash safety** -- the writer is a non-atomic ``Path.write_text``.  A crash
+  mid-write can lose entries but cannot break lint: unparsable JSON loads as an
+  empty cache and is recomputed.
+
+These tests *are* the verdict: when one fails, re-derive the writer-first
+semantics before changing the assertion rather than loosening it.
+"""
+
+from __future__ import annotations
+
+import ast
+import hashlib
+import inspect
+import json
+from pathlib import Path
+from typing import Any, cast
+
+import pytest
+from pylint.lint import PyLinter
+
+import python_setup_lint.checkers._semantic as semantic_module
+from python_setup_lint.checkers._semantic import semantic_check_if_meaningful
+from python_setup_lint.runner.dispatch import TOOLS, TOOLS_BY_NAME, _strategy_for
+from python_setup_lint.runner.types import RunnerConfig
+
+pytestmark = pytest.mark.no_external_api
+
+_PYLINT_TOOL_NAMES = ("pylint", "pylint-pyi", "pylint tests")
+
+
+class _FakeReranker:
+    """Stand-in for the optional cross-encoder so cache writes are exercised offline."""
+
+    def __init__(self, score: float) -> None:
+        self.score = score
+        self.calls = 0
+
+    def predict(self, _pairs: list[tuple[str, str]]) -> list[float]:
+        """Return a fixed score and count invocations."""
+        self.calls += 1
+        return [self.score]
+
+
+def _expected_cache_key(text: str, *, rule: str, code_context: str, comment: str) -> int:
+    """Compute the documented path-free cache key independently of the writer."""
+    model = cast(Any, semantic_module)._RERANKER_MODEL
+    payload = f"{text}|{rule}|{code_context}|{comment}|{model}"
+    return int.from_bytes(hashlib.sha256(payload.encode()).digest()[:8], "big")
+
+
+@pytest.fixture
+def semantic_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
+    """Route the semantic result cache to a per-test directory."""
+    cache_dir = tmp_path / "semantic"
+    cache_file = cache_dir / "results.json"
+    monkeypatch.setattr("python_setup_lint.checkers._semantic._CACHE_DIR", cache_dir)
+    monkeypatch.setattr("python_setup_lint.checkers._semantic._RESULT_CACHE_FILE", cache_file)
+    monkeypatch.setattr("python_setup_lint.checkers._semantic._RESULT_CACHE", None)
+    return cache_file
+
+
+class TestSemanticCacheWriter:
+    """Writer identity and timing of the cache produced inside a pylint run."""
+
+    def test_semantic_check_if_meaningful_given_new_verdicts_then_writes_each_miss_immediately(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: the in-process check call is the writer; each miss rewrites the file."""
+        reranker = _FakeReranker(score=0.9)
+        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: reranker)
+
+        assert not semantic_cache.exists()
+
+        assert (
+            semantic_check_if_meaningful(
+                "guarded by a lock",
+                rule="W9704",
+                code_context="lock = Lock()",
+                comment="guarded by a lock",
+            )
+            is True
+        )
+        first_payload = json.loads(semantic_cache.read_text())
+        assert list(first_payload.values()) == [True]
+
+        assert (
+            semantic_check_if_meaningful(
+                "retry is idempotent",
+                rule="W9704",
+                code_context="retry()",
+                comment="retry is idempotent",
+            )
+            is True
+        )
+        second_payload = json.loads(semantic_cache.read_text())
+        assert len(second_payload) == 2
+        assert first_payload.keys() <= second_payload.keys()
+        assert set(second_payload.values()) == {True}
+        assert reranker.calls == 2
+
+        # In-memory hit: no reranker call and no extra file rewrite.
+        assert (
+            semantic_check_if_meaningful(
+                "guarded by a lock",
+                rule="W9704",
+                code_context="lock = Lock()",
+                comment="guarded by a lock",
+            )
+            is True
+        )
+        assert reranker.calls == 2
+        assert json.loads(semantic_cache.read_text()) == second_payload
+
+    def test_semantic_check_if_meaningful_given_persisted_entry_then_serves_it_without_model_or_write(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: the cache is lazy-loaded from disk; a hit reaches neither writer nor model."""
+        text, rule, code_context, comment = (
+            "persisted verdict",
+            "W9704",
+            "guard()",
+            "persisted verdict",
+        )
+        key = _expected_cache_key(text, rule=rule, code_context=code_context, comment=comment)
+        semantic_cache.parent.mkdir(parents=True)
+        semantic_cache.write_text(json.dumps({str(key): False}))
+        persisted = semantic_cache.read_text()
+
+        def _unexpected_load() -> None:
+            raise AssertionError("cache hit must not load the reranker")
+
+        def _unexpected_write() -> None:
+            raise AssertionError("cache hit must not rewrite the result cache")
+
+        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", _unexpected_load)
+        monkeypatch.setattr("python_setup_lint.checkers._semantic._save_result_cache", _unexpected_write)
+
+        assert semantic_check_if_meaningful(text, rule=rule, code_context=code_context, comment=comment) is False
+        assert semantic_cache.read_text() == persisted
+
+    def test_semantic_check_if_meaningful_given_reranker_unavailable_then_writes_no_entry(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: the heuristic fallback path (None) creates neither cache file nor directory."""
+        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: None)
+
+        assert semantic_check_if_meaningful("checked elsewhere", rule="W9704", code_context="x = 1") is None
+        assert not semantic_cache.exists()
+        assert not semantic_cache.parent.exists()
+
+    def test_semantic_check_if_meaningful_given_truncated_cache_file_then_recovers_with_new_entry(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: a crash-truncated file loads as empty and is replaced by a valid rewrite."""
+        semantic_cache.parent.mkdir(parents=True)
+        semantic_cache.write_text('{"truncated": tru')
+        reranker = _FakeReranker(score=0.9)
+        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: reranker)
+
+        assert (
+            semantic_check_if_meaningful(
+                "crash tolerant",
+                rule="W9704",
+                code_context="cache = load()",
+                comment="crash tolerant",
+            )
+            is True
+        )
+        payload = json.loads(semantic_cache.read_text())
+        assert payload == {
+            str(
+                _expected_cache_key(
+                    "crash tolerant",
+                    rule="W9704",
+                    code_context="cache = load()",
+                    comment="crash tolerant",
+                )
+            ): True
+        }
+
+    def test_semantic_result_cache_given_single_writer_then_leaves_no_lock_or_sidecar_artifacts(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: sequential writes leave exactly ``results.json`` -- no lock or sidecar files."""
+        monkeypatch.setattr(
+            "python_setup_lint.checkers._semantic._load_reranker",
+            lambda: _FakeReranker(0.9),
+        )
+
+        assert semantic_check_if_meaningful("only writer", rule="W9704", code_context="x = 1", comment="only writer") is True
+        assert [entry.name for entry in sorted(semantic_cache.parent.iterdir())] == ["results.json"]
+
+
+class TestSemanticCachePathScoping:
+    """The cache is a single path-free store shared by every pylint invocation."""
+
+    def test_semantic_check_if_meaningful_given_identical_inputs_then_cache_key_ignores_source_path(
+        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: key = SHA-256(text, rule, context, comment, model); the API takes no path."""
+        monkeypatch.setattr(
+            "python_setup_lint.checkers._semantic._load_reranker",
+            lambda: _FakeReranker(0.9),
+        )
+        text, rule, code_context, comment = (
+            "path free key",
+            "W9704",
+            "value = load()",
+            "path free key",
+        )
+
+        assert semantic_check_if_meaningful(text, rule=rule, code_context=code_context, comment=comment) is True
+        expected = _expected_cache_key(text, rule=rule, code_context=code_context, comment=comment)
+        assert json.loads(semantic_cache.read_text()) == {str(expected): True}
+
+        signature = inspect.signature(semantic_check_if_meaningful)
+        assert set(signature.parameters).isdisjoint({"path", "file", "filename"})
+
+    def test_semantic_result_cache_file_given_runner_invocations_then_single_home_location(
+        self,
+    ) -> None:
+        """OBSERVED: one process-independent cache file, not a per-path or per-cwd cache."""
+        module = cast(Any, semantic_module)
+        expected_dir = Path.home() / ".cache" / "python-setup" / "semantic"
+        assert expected_dir == module._CACHE_DIR
+        assert (expected_dir / "results.json") == module._RESULT_CACHE_FILE
+
+    def test_runner_pylint_commands_given_path_scope_then_scope_file_targets_only(self, tmp_path: Path) -> None:
+        """OBSERVED: --path narrows lint targets; default runs keep each tool's own scope."""
+        (tmp_path / "src").mkdir()
+        (tmp_path / "src" / "app.py").write_text("APP = 1\n")
+        (tmp_path / "src" / "app.pyi").write_text("APP: int\n")
+        (tmp_path / "tests").mkdir()
+        (tmp_path / "tests" / "test_app.py").write_text("def test_app() -> None: ...\n")
+        config = RunnerConfig(cwd=tmp_path)
+
+        scoped_targets = {
+            "pylint": "src/app.py",
+            "pylint-pyi": "src/app.pyi",
+            "pylint tests": "src/app.py",
+        }
+        for tool_name, expected_target in scoped_targets.items():
+            command = _strategy_for(tool_name, TOOLS_BY_NAME[tool_name]).build_command(config=config, _path="src")
+            assert expected_target in command
+            assert "tests/test_app.py" not in command
+
+        default_targets = {
+            "pylint": "src/app.py",
+            "pylint-pyi": "src/app.pyi",
+            "pylint tests": "tests/test_app.py",
+        }
+        for tool_name, expected_target in default_targets.items():
+            command = _strategy_for(tool_name, TOOLS_BY_NAME[tool_name]).build_command(config=config)
+            assert expected_target in command
+
+    def test_semantic_cache_writer_given_source_tree_then_only_check_call_path_writes(
+        self,
+    ) -> None:
+        """OBSERVED: `_save_result_cache` has one caller; runner code never performs a merge."""
+        source = Path(semantic_module.__file__).read_text()
+        tree = ast.parse(source)
+        save_calls = [
+            node
+            for node in ast.walk(tree)
+            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "_save_result_cache"
+        ]
+        assert len(save_calls) == 1
+        callers = [
+            node.name
+            for node in ast.walk(tree)
+            if isinstance(node, ast.FunctionDef)
+            and any(
+                isinstance(call, ast.Call) and getattr(call.func, "id", None) == "_save_result_cache" for call in ast.walk(node)
+            )
+        ]
+        assert callers == ["semantic_check_if_meaningful"]
+
+        runner_dir = Path(semantic_module.__file__).parent.parent / "runner"
+        assert not [
+            path.name
+            for path in runner_dir.rglob("*.py")
+            if "_save_result_cache" in path.read_text() or "_RESULT_CACHE_FILE" in path.read_text()
+        ]
+
+        checkers_dir = Path(semantic_module.__file__).parent
+        assert not [
+            path.name
+            for path in checkers_dir.rglob("*.py")
+            if path.name != Path(semantic_module.__file__).name
+            and ("_save_result_cache" in path.read_text() or "_RESULT_CACHE_FILE" in path.read_text())
+        ]
+
+
+class TestPylintInvocationConcurrency:
+    """Single-writer assumptions on the pylint invocations that produce cache entries."""
+
+    @pytest.mark.parametrize("tool_name", _PYLINT_TOOL_NAMES)
+    def test_runner_pylint_command_given_default_runner_config_then_passes_no_jobs_flag(
+        self, tool_name: str, tmp_path: Path
+    ) -> None:
+        """OBSERVED: the runner keeps every pylint invocation single-process."""
+        (tmp_path / "src").mkdir()
+        (tmp_path / "src" / "app.py").write_text("APP = 1\n")
+        config = RunnerConfig(cwd=tmp_path)
+
+        spec = TOOLS_BY_NAME[tool_name]
+        assert spec.command == ["pylint"]
+        command = _strategy_for(tool_name, spec).build_command(config=config)
+        assert "-j" not in command
+        assert "--jobs" not in command
+        assert not any(argument.startswith("--jobs=") for argument in command)
+
+    def test_runner_pylint_tools_given_registry_order_then_three_sequential_specs_share_executable(
+        self,
+    ) -> None:
+        """OBSERVED: pylint, pylint-pyi and pylint tests are separate sequential invocations."""
+        pylint_tools = [spec for spec in TOOLS if spec.command == ["pylint"]]
+        assert [spec.name for spec in pylint_tools] == list(_PYLINT_TOOL_NAMES)
+        assert all(spec.supports_path for spec in pylint_tools)
+
+    def test_pylint_linter_given_default_options_then_jobs_equals_one(self) -> None:
+        """OBSERVED at pylint 4.0.6: the default run has no worker pool."""
+        assert PyLinter().config.jobs == 1
+
+    def test_pylint_linter_given_jobs_over_one_then_dispatches_parallel_check(
+        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
+    ) -> None:
+        """OBSERVED: ``-j > 1`` hands lints to ``check_parallel`` (separate process writers)."""
+        source = tmp_path / "sample.py"
+        source.write_text("VALUE = 1\n")
+        dispatched: list[int] = []
+
+        def _record_parallel(
+            _linter: PyLinter,
+            jobs: int,
+            _files: object,
+            _extra_packages_paths: object = None,
+        ) -> None:
+            dispatched.append(jobs)
+
+        monkeypatch.setattr("pylint.lint.pylinter.check_parallel", _record_parallel)
+        linter = PyLinter()
+        linter.set_option("jobs", 2)
+        linter.check([str(source)])
+
+        assert dispatched == [2]

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
