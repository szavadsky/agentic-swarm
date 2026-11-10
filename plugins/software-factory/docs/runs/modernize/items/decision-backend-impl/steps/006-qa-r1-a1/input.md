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
  "slug": "decision-backend-impl",
  "kind": "dev",
  "title": "Implement veto DecisionBackend with FakeBackend",
  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
  "outlineRef": "decision-backend-impl",
  "milestone": "M4",
  "wave": 2,
  "deps": [
    "decision-cache-design-spike",
    "semantic-threshold-consolidation"
  ],
  "scenarioRefs": [
    "M4: Veto backend without model"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:1-12",
    "src/python_setup_lint/checkers/_semantic.py:93-122",
    "src/python_setup_lint/checkers/_semantic.py:125-189",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "pyproject.toml:28-31",
    "AGENTS.md:79-85"
  ],
  "escalate": true
}

## Engine Checks


## Test Diff


## Code Diff
diff --git a/.factory/tasks/modernize/decisions/010-item-decision-backend-impl.yaml b/.factory/tasks/modernize/decisions/010-item-decision-backend-impl.yaml
deleted file mode 100644
index 54ad821..0000000
--- a/.factory/tasks/modernize/decisions/010-item-decision-backend-impl.yaml
+++ /dev/null
@@ -1,39 +0,0 @@
-id: decision-decision-backend-impl-1794196081770
-context: item
-item: decision-backend-impl
-afterRecord: 004-develop-r1-a2
-decision: retry-with-guidance
-timestamp: 2026-11-09T03:48:01.770Z
-rationale: "SEMANTIC=0 heuristic regression, not an intended shift. Golden
-  capture runs with PYTHON_SETUP_LINT_SEMANTIC=0 (tests/integration.py:112), so
-  ADR-014 requires byte-identical heuristic behavior: veto applies only when
-  SEMANTIC=1 with a live backend, and any-element echo is a no-op for
-  single-code rules. New finding at mod.py:42 (preceding-line reason 'pylint:
-  disable=some-rule' now rejected) proves the heuristic was tightened beyond the
-  joiner/sort/match allowance. Fix is bounded: restore exact heuristic under
-  SEMANTIC=0."
-text: "Fix in this order (zero tests/data writes; golden-regen-hatch is sole
-  golden writer; no shift report — this is a no-shift bug): (1) Preserve
-  SEMANTIC=0 exactly: keep
-  `os.environ.get('PYTHON_SETUP_LINT_SEMANTIC','1')=='1'` guard; when '0', skip
-  semantic/backend entirely and return the heuristic bool directly. (2) Restore
-  heuristic byte-identical to _base.py:160-238: primary=(comment or
-  text).strip(); empty/<5 False; exact `primary_lower in boilerplate` (50-entry,
-  no word-split/substring); exact `primary_lower in meaningless_phrases` (no
-  substring); rule-echo only as `primary_lower == any(element_lower)` over
-  normalize_suppressed_codes(rule).split(',') — no suppression-pattern
-  rejection, no extra boilerplate. Nachweis: check_if_meaningful('pylint:
-  disable=some-rule', rule='unjustified-suppression', code_context='def
-  _bare_suppression() -> None:', comment=same) with SEMANTIC=0 must be True
-  (preceding-suppression quirk from
-  suppression_justification_checker.py:377-386; checker-level fix belongs to
-  checkers-legacy, not backend). (3) None mapping: semantic_check returns None
-  (not False) when loader/backend None; veto heuristic AND (prob>=0.5) only when
-  backend returns float. (4) Revert any test asserts of the buggy False for
-  line-42-style reasons; keep test_decision_backend.py but pin SEMANTIC=0
-  preservation. Minimize tests/assumptions + test_semantic_check churn (full
-  rewrite is semantic-tests-rewrite via dep). (5) Verify: `uv run pytest
-  tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint -q`
-  golden hash-equal (line 41 only, no line 42); `uv run pytest -q` no new
-  failures vs M1 table; uv.lock still resolves."
-persist: true
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..1d668a5
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,77 @@
+checks:
+  - id: test-first-scope
+    status: fail
+    message: New prod stub lines (84) exceeded limit of 40
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 21 expected tests failed with assertion failures"
+    details:
+      command: uv run pytest tests/checkers/test_decision_backend.py
+        tests/checkers/test_semantic_check.py
+        tests/checkers/test_no_try_import_checker.py
+        tests/checkers/test_suppression_justification_checker.py
+        tests/assumptions/test_pylint_cache_semantics.py
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-1794191221087-d2f93x54zl6.xml
+      junitCaseCount: 120
+      junitCaseIds:
+        - tests.checkers.test_decision_backend.test_decision_threshold_is_pinned_at_half
+        - tests.checkers.test_decision_backend.test_prompt_version_is_pinned
+        - tests.checkers.test_decision_backend.test_fake_backend_defaults_to_one_and_pinned_model_id
+        - tests.checkers.test_decision_backend.test_fake_backend_returns_configured_score
+        - tests.checkers.test_decision_backend.test_fake_backend_satisfies_protocol
+        - tests.checkers.test_decision_backend.test_get_backend_is_none_without_configuration
+        - tests.checkers.test_decision_backend.test_get_backend_honors_dotted_path_under_pytest
+        - tests.checkers.test_decision_backend.test_get_backend_ignores_dotted_path_in_production
+        - tests.checkers.test_decision_backend.test_decision_model_parses_but_yields_none_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_reranker_model_env_is_deprecated_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+        - tests.checkers.test_decision_backend.test_registered_backend_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_brush_off_is_vetoed_before_the_backend
+        - tests.checkers.test_decision_backend.test_brush_off_does_not_reach_the_semantic_adapter
+        - tests.checkers.test_decision_backend.test_meaningful_heuristic_is_confirmed_by_backend
+        - tests.checkers.test_decision_backend.test_backend_below_threshold_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_loader_none_falls_back_to_the_heuristic
+        - tests.checkers.test_decision_backend.test_semantic_disabled_never_calls_the_backend
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment]  #
+          assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment,arg-type]  #
+          arg-type, assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[noqa: E501, W9704  # W9704,E501]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _keeps_a_real_reason[type: ignore[assignment]  # carried from library
+          httpx for type compatibility]"
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_keeps_a_real_reason[carried
+          from library httpx for type compatibility]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[W9704,E501-W9704,E501]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[assignment-assignment]
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_rejects_code_echo_justification
+        - tests.checkers.test_decision_backend.test_semantic_extra_is_empty
+        - tests.checkers.test_decision_backend.test_uv_lock_has_no_sentence_transformers_edge
+        - tests.checkers.test_semantic_check.test_signature_exposes_backend_keyword_defaulting_to_none
+        - tests.checkers.test_semantic_check.test_empty_primary_returns_false_without_calling_backend
+        - tests.checkers.test_semantic_check.test_loader_none_maps_to_none
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.0-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.499-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.5-True]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[1.0-True]
+        - tests.checkers.test_semantic_check.test_one_backend_call_per_unique_pair
+        - tests.checkers.test_semantic_check.test_distinct_pairs_call_backend_again
+        - tests.checkers.test_semantic_check.test_memo_key_includes_backend_model_id
+        - tests.checkers.test_semantic_check.test_module_does_not_reference_sentence_transformers
+        - tests.checkers.test_semantic_check.test_check_writes_no_disk_cache
+        - tests.checkers.test_no_try_import_checker.test_sentence_transformers_is_no_longer_an_optional_import_pattern
+        - tests.checkers.test_no_try_import_checker.test_try_import_of_sentence_transformers_is_flagged
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_modulenotfound]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[from_import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_bare_except]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_tuple_import_errors]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_try_blocks]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_handlers_one_try]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_non_import_handler_not_flagged]
+      junitTruncated: true
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/input.md b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..d729fa3
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,72 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "decision-backend-impl",
+  "kind": "dev",
+  "title": "Implement veto DecisionBackend with FakeBackend",
+  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "decision-backend-impl",
+  "milestone": "M4",
+  "wave": 2,
+  "deps": [
+    "decision-cache-design-spike",
+    "semantic-threshold-consolidation"
+  ],
+  "scenarioRefs": [
+    "M4: Veto backend without model"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "pyproject.toml:28-31",
+    "AGENTS.md:79-85"
+  ],
+  "escalate": true
+}
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "src/python_setup_lint/checkers/_semantic.py:125-189",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "pyproject.toml:28-31",
+  "AGENTS.md:79-85"
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
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..937857c
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: test-first
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-09T01:58:21.657Z
+session: 01a1be07-dce8-748f-806e-bc484bc28d84
+endedAt: 2026-11-09T02:27:05.421Z
+usage:
+  inputTokens: 235859
+  outputTokens: 98651
+  costUsd: 0.159634
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-776Z_01a1be07-dce8-748f-806e-bc484bc28d84
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..47a28e8
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,89 @@
+status: ok
+summary: Authored test-first coverage for the veto DecisionBackend work. Added
+  interface-only stubs src/python_setup_lint/checkers/_decision_backend.py/.pyi
+  (no behavior; FakeBackend/get_backend raise NotImplementedError, model
+  id/constants pinned) so tests collect/import. Added
+  tests/checkers/test_decision_backend.py (constants, FakeBackend 1.0 +
+  'fake-backend rev test prompt-v1', loader with PYTEST_CURRENT_TEST guard
+  honored vs production-ignored, decision-model/reranker once-per-process
+  structlog warnings, backend=None kwarg on check_if_meaningful, heuristic-first
+  veto before the semantic adapter/backend, registered-backend end-to-end
+  rejection, code-echo normalization, empty [semantic] extra, uv.lock edge
+  absence). Rewrote tests/checkers/test_semantic_check.py to the backend-adapter
+  contract (backend=None keyword, 0.5 threshold mapping, None loader mapping,
+  one call per unique pair/model, no sentence-transformers reference, no disk
+  cache). Added no_try_import tests removing sentence_transformers from optional
+  patterns, code-echo/on-Any-element checker tests, and rewrote the semantic
+  portions of tests/assumptions/test_pylint_cache_semantics.py to the read-only
+  in-process memo contract while keeping the pylint jobs/serial-invocation
+  watchdogs. Existing production code was left untouched; only new interface
+  stubs were added.
+target:
+  selectors:
+    - tests/checkers/test_decision_backend.py
+    - tests/checkers/test_semantic_check.py
+    - tests/checkers/test_no_try_import_checker.py
+    - tests/checkers/test_suppression_justification_checker.py
+    - tests/assumptions/test_pylint_cache_semantics.py
+  expectRed:
+    - tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id
+    - tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest
+    - tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production
+    - tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+    - tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend
+    - tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter
+    - tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification
+    - tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty
+    - tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge
+    - tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none
+    - tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair
+    - tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers
+    - tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache
+    - tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern
+    - tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged
+    - tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing
+evidence:
+  - "uv run pytest -q --tb=no: 48 failed, 1329 passed, 13 deselected. Every
+    failure is in the newly authored/rewritten behavior tests; no unrelated
+    regressions."
+  - "uv run pytest with the 21 declared expectRed node ids: 21 failed in 0.73s
+    (all target-red confirmed)."
+  - "uv run pytest tests/integration.py -q: 9 passed, proving the SEMANTIC=0
+    golden snapshot (multiset + byte-identical replay) is unchanged by this
+    test-only delta."
+  - "Runner failure detection proven:
+    test_brush_off_does_not_reach_the_semantic_adapter fails with the intended
+    AssertionError (semantic adapter reached on a brush-off)."
+  - "uv run ruff check --config config/ruff.toml on all changed/new files: All
+    checks passed."
+  - "uv run ruff format --config config/ruff.toml --check on all changed/new
+    files: 7 files already formatted."
+  - "uv run pylint --rcfile config/.pylintrc-tests on all changed tests:
+    10.00/10."
+  - "uv run pylint --rcfile config/.pylintrc-pyi
+    src/python_setup_lint/checkers/_decision_backend.pyi: 10.00/10."
+  - "uv run mypy src/python_setup_lint/checkers/_decision_backend.py: Success,
+    no issues; uv run pyright on the same stub: 0 errors."
+  - wc -l confirms all touched/new modules are <= 500 lines (stub 51/33, backend
+    test 320, semantic test 133, assumptions 355).
+concerns:
+  - Tests intentionally call the not-yet-existing backend= keyword and private
+    _reset_* helpers, so mypy on the test files still reports expected
+    call-arg/attr-defined errors until the develop step updates
+    _base.pyi/_semantic.pyi (tests are excluded from pyright).
+  - "Tests define the _base.normalize_suppressed_codes contract: strip a
+    suppression directive and its code list; reject a trailing reason that
+    merely echoes those codes order-insensitively; leave bare/plain text
+    unchanged."
+  - The obsolete reranker/disk-cache tests were replaced rather than left
+    failing; the pylint jobs and serial-invocation watchdog tests in
+    tests/assumptions/test_pylint_cache_semantics.py were preserved.
+notes: The assignment provided the ADR-014 pinned values directly, so no
+  blocked/no-op attestation path was used. _decision_backend.py/.pyi are
+  interface stubs only (public functions raise NotImplementedError; FakeBackend
+  exposes the pinned model id). No existing production file was modified.
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/checks.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/checks.yaml
new file mode 100644
index 0000000..e310931
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/checks.yaml
@@ -0,0 +1,87 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (5 test files, 1 new prod stubs with 29 lines)
+    details:
+      testFiles:
+        - tests/assumptions/test_pylint_cache_semantics.py
+        - tests/checkers/test_decision_backend.py
+        - tests/checkers/test_no_try_import_checker.py
+        - tests/checkers/test_semantic_check.py
+        - tests/checkers/test_suppression_justification_checker.py
+      newProdFiles:
+        - src/python_setup_lint/checkers/_decision_backend.py
+      stubProdLines: 29
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 33 expected tests failed with assertion failures"
+    details:
+      command: uv run pytest tests/checkers/test_decision_backend.py
+        tests/checkers/test_semantic_check.py
+        tests/checkers/test_no_try_import_checker.py
+        tests/checkers/test_suppression_justification_checker.py
+        tests/assumptions/test_pylint_cache_semantics.py
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-1794191458489-9vbgcy7xixs.xml
+      junitCaseCount: 120
+      junitCaseIds:
+        - tests.checkers.test_decision_backend.test_decision_threshold_is_pinned_at_half
+        - tests.checkers.test_decision_backend.test_prompt_version_is_pinned
+        - tests.checkers.test_decision_backend.test_fake_backend_defaults_to_one_and_pinned_model_id
+        - tests.checkers.test_decision_backend.test_fake_backend_returns_configured_score
+        - tests.checkers.test_decision_backend.test_fake_backend_satisfies_protocol
+        - tests.checkers.test_decision_backend.test_get_backend_is_none_without_configuration
+        - tests.checkers.test_decision_backend.test_get_backend_honors_dotted_path_under_pytest
+        - tests.checkers.test_decision_backend.test_get_backend_ignores_dotted_path_in_production
+        - tests.checkers.test_decision_backend.test_decision_model_parses_but_yields_none_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_reranker_model_env_is_deprecated_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+        - tests.checkers.test_decision_backend.test_registered_backend_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_brush_off_is_vetoed_before_the_backend
+        - tests.checkers.test_decision_backend.test_brush_off_does_not_reach_the_semantic_adapter
+        - tests.checkers.test_decision_backend.test_meaningful_heuristic_is_confirmed_by_backend
+        - tests.checkers.test_decision_backend.test_backend_below_threshold_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_loader_none_falls_back_to_the_heuristic
+        - tests.checkers.test_decision_backend.test_semantic_disabled_never_calls_the_backend
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment]  #
+          assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment,arg-type]  #
+          arg-type, assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[noqa: E501, W9704  # W9704,E501]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _keeps_a_real_reason[type: ignore[assignment]  # carried from library
+          httpx for type compatibility]"
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_keeps_a_real_reason[carried
+          from library httpx for type compatibility]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[W9704,E501-W9704,E501]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[assignment-assignment]
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_rejects_code_echo_justification
+        - tests.checkers.test_decision_backend.test_semantic_extra_is_empty
+        - tests.checkers.test_decision_backend.test_uv_lock_has_no_sentence_transformers_edge
+        - tests.checkers.test_semantic_check.test_signature_exposes_backend_keyword_defaulting_to_none
+        - tests.checkers.test_semantic_check.test_empty_primary_returns_false_without_calling_backend
+        - tests.checkers.test_semantic_check.test_loader_none_maps_to_none
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.0-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.499-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.5-True]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[1.0-True]
+        - tests.checkers.test_semantic_check.test_one_backend_call_per_unique_pair
+        - tests.checkers.test_semantic_check.test_distinct_pairs_call_backend_again
+        - tests.checkers.test_semantic_check.test_memo_key_includes_backend_model_id
+        - tests.checkers.test_semantic_check.test_module_does_not_reference_sentence_transformers
+        - tests.checkers.test_semantic_check.test_check_writes_no_disk_cache
+        - tests.checkers.test_no_try_import_checker.test_sentence_transformers_is_no_longer_an_optional_import_pattern
+        - tests.checkers.test_no_try_import_checker.test_try_import_of_sentence_transformers_is_flagged
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_modulenotfound]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[from_import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_bare_except]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_tuple_import_errors]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_try_blocks]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_handlers_one_try]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_non_import_handler_not_flagged]
+      junitTruncated: true
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/input.md b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/input.md
new file mode 100644
index 0000000..2932b54
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/input.md
@@ -0,0 +1,79 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "decision-backend-impl",
+  "kind": "dev",
+  "title": "Implement veto DecisionBackend with FakeBackend",
+  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "decision-backend-impl",
+  "milestone": "M4",
+  "wave": 2,
+  "deps": [
+    "decision-cache-design-spike",
+    "semantic-threshold-consolidation"
+  ],
+  "scenarioRefs": [
+    "M4: Veto backend without model"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "pyproject.toml:28-31",
+    "AGENTS.md:79-85"
+  ],
+  "escalate": true
+}
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "src/python_setup_lint/checkers/_semantic.py:125-189",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "pyproject.toml:28-31",
+  "AGENTS.md:79-85"
+]
+
+## Review Feedback
+Failing check: test-first-scope
+
+Message: New prod stub lines (84) exceeded limit of 40
+
+Budget: 84 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/meta.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/meta.yaml
new file mode 100644
index 0000000..bf5f893
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: test-first
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T02:27:10.582Z
+session: 01a1be21-8a54-776a-b0b7-7e49004123d8
+endedAt: 2026-11-09T02:31:02.523Z
+usage:
+  inputTokens: 55630
+  outputTokens: 28540
+  costUsd: 0.029351
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-572Z_01a1be21-8a54-776a-b0b7-7e49004123d8
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/output.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/output.yaml
new file mode 100644
index 0000000..b30a04d
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/output.yaml
@@ -0,0 +1,103 @@
+status: ok
+summary: Fixed the test-first-scope failure without touching any test file. The
+  rejected attempt had introduced 84 new production-stub lines (51 in
+  checkers/_decision_backend.py + 33 in checkers/_decision_backend.pyi),
+  exceeding the 40-line stub budget. I replaced the stub with a 29-line runtime
+  interface stub exporting exactly what the tests import
+  (DECISION_THRESHOLD=0.5, PROMPT_VERSION='prompt-v1', DecisionBackend protocol,
+  FakeBackend with pinned model_id, get_backend, and the _reset_backend_state
+  test helper) and removed the redundant .pyi; the complete .pyi belongs to the
+  implementation step's prod budget, not the test-first stub budget. Cumulative
+  story diff under src/ is now exactly 29 added lines (0 deletions), no
+  pre-story production code was modified, and all 120 tests across the five
+  touched test files still collect. 33 declared red tests (18 in
+  test_decision_backend.py, 7 in test_semantic_check.py, 2 in
+  test_no_try_import_checker.py, 1 in test_suppression_justification_checker.py,
+  5 in test_pylint_cache_semantics.py) all fail red with
+  NotImplementedError/TypeError/AssertionError, proving the required behavior
+  does not yet exist; no failure is an import or collection error.
+target:
+  selectors:
+    - tests/checkers/test_decision_backend.py
+    - tests/checkers/test_semantic_check.py
+    - tests/checkers/test_no_try_import_checker.py
+    - tests/checkers/test_suppression_justification_checker.py
+    - tests/assumptions/test_pylint_cache_semantics.py
+  expectRed:
+    - tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id
+    - tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score
+    - tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol
+    - tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration
+    - tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest
+    - tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production
+    - tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+    - tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend
+    - tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter
+    - tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend
+    - tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification
+    - tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty
+    - tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge
+    - tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none
+    - tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend
+    - tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair
+    - tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again
+    - tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id
+    - tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers
+    - tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache
+    - tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern
+    - tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged
+    - tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer
+evidence:
+  - "Scope fix: `wc -l src/python_setup_lint/checkers/_decision_backend.py` ->
+    29 lines; `git diff fc2770d --numstat -- src` -> `29 0
+    src/python_setup_lint/checkers/_decision_backend.py` (29 added prod stub
+    lines vs the 40-line stub budget; the 33-line .pyi from the rejected attempt
+    was removed)."
+  - "No pre-story production code touched: `git diff fc2770d --numstat -- src`
+    lists only the new _decision_backend.py; `git status --porcelain` in the
+    step shows only `M src/.../_decision_backend.py` and `D
+    src/.../_decision_backend.pyi` (both introduced by the rejected attempt)."
+  - "Test infra proven: `uv run pytest --collect-only -q <5 touched test files>`
+    -> 120 tests collected, 0 errors, confirming no import/collection breakage
+    from the stub reshape."
+  - "Red proof (decision backend, 18 ids): `uv run pytest -q --tb=no <18
+    declared test_decision_backend.py node ids>` -> `18 failed` with
+    NotImplementedError (FakeBackend/get_backend stubs), missing `backend=`
+    kwarg TypeError, and behavioral AssertionErrors."
+  - "Red proof (cross-file, 15 ids): `uv run pytest -q --tb=no <7
+    test_semantic_check + 2 no_try_import + 1 suppression + 5
+    pylint_cache_semantics node ids>` -> `15 failed` with TypeError missing
+    `backend`, AssertionErrors for
+    memoization/normalization/sentence-transformers packaging pins, and
+    missing-stub behavior."
+  - "Full touched-files run: `uv run pytest <5 files> -q --tb=no` -> 48 failed /
+    72 passed, all failures genuine behavioral reds (no
+    ImportError/CollectionError anywhere)."
+  - Pinned-value tests still pass on current prod code as expected
+    (DECISION_THRESHOLD == 0.5, PROMPT_VERSION == 'prompt-v1'); they are
+    intentionally not declared red.
+concerns:
+  - checkers/_decision_backend.pyi was intentionally removed from this
+    test-first step; the implementation step must restore the complete companion
+    stub (the repo's stub checker emits E97A0 missing-module-stub if self-lint
+    runs before then). The .pyi was omitted here only to stay inside the 40-line
+    test-first stub budget.
+  - Parametrized red cases (normalize_suppressed_codes variants, threshold
+    boundary 0.5-True, Any-element variants) were verified red but left out of
+    expectRed to avoid brittle parametrized-id normalization; their
+    non-parametrized behavioral equivalents are declared.
+notes: "The stub is a minimal runtime interface stub: it exports only names the
+  declared tests import and raises NotImplementedError/basic assertions so
+  target-red reflects absent functionality rather than import failure. Test
+  files were not modified in this attempt; only the production-stub surface was
+  shrunk from 84 to 29 lines."
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..5e6e4d4
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/checks.yaml
@@ -0,0 +1,363 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: test-integration"
+    details:
+      - id: format
+        command: uv run ruff format --check --config config/ruff.toml src tests
+        status: pass
+        durationMs: 203
+        details: 184 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 55701
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
+          Success: No issues found in 29 files (12ms)
+
+          ============================================================
+          [mypy] PASSED [4.4s]
+          ============================================================
+          Success: no issues found in 57 source files
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
+          [mypy.stubtest] PASSED [6.8s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [3.9s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794193822336",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 112,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 3.471
+              }
+          }
+
+
+          ============================================================
+          [pyright verify types] PASSED [0.9s]
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
+                  "modulesLinted": 59,
+                  "score": 10.0
+              }
+          }
+
+          ============================================================
+          [pylint-pyi] PASSED [9.2s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [14.8s]
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
+          [detect-secrets] PASSED [5.5s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 27422
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~21.9s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 25.55s
+          [Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]
+        improvements:
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+          - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+          - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      - id: test-integration
+        command: uv run pytest tests/integration.py -q
+        status: fail
+        durationMs: 107159
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~49.3s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          F........                                                                [100%]
+          =================================== FAILURES ===================================
+          _______________ TestMinimalSampleProject.test_setup_new_and_lint _______________
+
+          self = <tests.integration.TestMinimalSampleProject object at 0x73568ef77d90>
+          tmp_path = PosixPath('/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/pytest-of-slava/pytest-217/test_setup_new_and_lint0')
+          capsys = <_pytest.capture.CaptureFixture object at 0x73568efb5fd0>
+          monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x73568ef1c180>
+          isolated_runner_registries = None
+
+              def test_setup_new_and_lint(
+                  self,
+                  tmp_path: Path,
+                  capsys: pytest.CaptureFixture[str],
+                  monkeypatch: pytest.MonkeyPatch,
+                  isolated_runner_registries: None,
+              ) -> None:
+                  """Run lint on the sample project and pin every finding in the golden snapshot.
+              
+                  Asserts:
+                  - The first run exits non-zero, reports every tool section, does not
+                    crash, does not skip for unexpected reasons and fires W9705.
+                  - A dedicated
+          ... [truncated 3313 bytes] ...
+              def assert_matches_golden(findings: Sequence[Finding], *, golden_path: Path) -> None:
+                  """Assert *findings* equal the committed golden as a multiset.
+              
+                  With ``PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`` this rewrites the golden and its
+                  counts instead of comparing.  Under CI it fails rather than rewriting.
+                  """
+                  if os.environ.get(UPDATE_ENV) == "1":
+                      if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
+                          pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+                      warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+                      write_golden_files(golden_path, findings)
+                      return
+                  committed = read_golden(golden_path)
+                  added, removed = _diff_keys(findings, committed)
+                  if added or removed:
+          >           pytest.fail(_format_drift(added, removed, golden_path))
+          E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+          E           added (3):
+          E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+
+          tests/_golden.py:389: Failed
+          ========================= Tach Impact Analysis Warning =========================
+          [Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
+          [Tach] These failures would be missed when using --tach:
+          [Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
+          =========================== short test summary info ============================
+          FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+          added (3):
+            ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+            ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+            ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          1 failed, 8 passed in 55.61s
+          [New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
+        failingTests:
+          - tests.integration.TestMinimalSampleProject.test_setup_new_and_lint
+    output: |-
+      get("GITHUB_ACTIONS"):
+                      pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+                  warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+                  write_golden_files(golden_path, findings)
+                  return
+              committed = read_golden(golden_path)
+              added, removed = _diff_keys(findings, committed)
+              if added or removed:
+      >           pytest.fail(_format_drift(added, removed, golden_path))
+      E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+      E           added (3):
+      E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+
+      tests/_golden.py:389: Failed
+      ========================= Tach Impact Analysis Warning =========================
+      [Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
+      [Tach] These failures would be missed when using --tach:
+      [Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
+      =========================== short test summary info ============================
+      FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+      added (3):
+        ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+        ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+        ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      1 failed, 8 passed in 55.61s
+      [New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: uv run pytest tests/checkers/test_decision_backend.py
+        tests/checkers/test_semantic_check.py
+        tests/checkers/test_no_try_import_checker.py
+        tests/checkers/test_suppression_justification_checker.py
+        tests/assumptions/test_pylint_cache_semantics.py
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-green-1794193996654-7ae39menab3.xml
+      junitCaseCount: 120
+      junitCaseIds:
+        - tests.checkers.test_decision_backend.test_decision_threshold_is_pinned_at_half
+        - tests.checkers.test_decision_backend.test_prompt_version_is_pinned
+        - tests.checkers.test_decision_backend.test_fake_backend_defaults_to_one_and_pinned_model_id
+        - tests.checkers.test_decision_backend.test_fake_backend_returns_configured_score
+        - tests.checkers.test_decision_backend.test_fake_backend_satisfies_protocol
+        - tests.checkers.test_decision_backend.test_get_backend_is_none_without_configuration
+        - tests.checkers.test_decision_backend.test_get_backend_honors_dotted_path_under_pytest
+        - tests.checkers.test_decision_backend.test_get_backend_ignores_dotted_path_in_production
+        - tests.checkers.test_decision_backend.test_decision_model_parses_but_yields_none_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_reranker_model_env_is_deprecated_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+        - tests.checkers.test_decision_backend.test_registered_backend_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_brush_off_is_vetoed_before_the_backend
+        - tests.checkers.test_decision_backend.test_brush_off_does_not_reach_the_semantic_adapter
+        - tests.checkers.test_decision_backend.test_meaningful_heuristic_is_confirmed_by_backend
+        - tests.checkers.test_decision_backend.test_backend_below_threshold_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_loader_none_falls_back_to_the_heuristic
+        - tests.checkers.test_decision_backend.test_semantic_disabled_never_calls_the_backend
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment]  #
+          assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment,arg-type]  #
+          arg-type, assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[noqa: E501, W9704  # W9704,E501]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _keeps_a_real_reason[type: ignore[assignment]  # carried from library
+          httpx for type compatibility]"
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_keeps_a_real_reason[carried
+          from library httpx for type compatibility]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[W9704,E501-W9704,E501]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[assignment-assignment]
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_rejects_code_echo_justification
+        - tests.checkers.test_decision_backend.test_semantic_extra_is_empty
+        - tests.checkers.test_decision_backend.test_uv_lock_has_no_sentence_transformers_edge
+        - tests.checkers.test_semantic_check.test_signature_exposes_backend_keyword_defaulting_to_none
+        - tests.checkers.test_semantic_check.test_empty_primary_returns_false_without_calling_backend
+        - tests.checkers.test_semantic_check.test_loader_none_maps_to_none
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.0-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.499-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.5-True]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[1.0-True]
+        - tests.checkers.test_semantic_check.test_one_backend_call_per_unique_pair
+        - tests.checkers.test_semantic_check.test_distinct_pairs_call_backend_again
+        - tests.checkers.test_semantic_check.test_memo_key_includes_backend_model_id
+        - tests.checkers.test_semantic_check.test_module_does_not_reference_sentence_transformers
+        - tests.checkers.test_semantic_check.test_check_writes_no_disk_cache
+        - tests.checkers.test_no_try_import_checker.test_sentence_transformers_is_no_longer_an_optional_import_pattern
+        - tests.checkers.test_no_try_import_checker.test_try_import_of_sentence_transformers_is_flagged
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_modulenotfound]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[from_import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_bare_except]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_tuple_import_errors]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_try_blocks]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_handlers_one_try]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_non_import_handler_not_flagged]
+      junitTruncated: true
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: fail
+    message: Production changes (444 lines) exceeded limit (300 lines) for kind dev
+    details:
+      changedLines:
+        added: 251
+        deleted: 193
+        total: 444
+        files:
+          - src/python_setup_lint/checkers/_base.py
+          - src/python_setup_lint/checkers/_base.pyi
+          - src/python_setup_lint/checkers/_decision_backend.py
+          - src/python_setup_lint/checkers/_semantic.py
+          - src/python_setup_lint/checkers/_semantic.pyi
+          - src/python_setup_lint/checkers/conformance/no_try_import_checker.py
+          - src/python_setup_lint/checkers/_decision_backend.pyi
+      limit: 300
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/input.md b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/input.md
new file mode 100644
index 0000000..7d51bbd
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/input.md
@@ -0,0 +1,114 @@
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
+  "slug": "decision-backend-impl",
+  "kind": "dev",
+  "title": "Implement veto DecisionBackend with FakeBackend",
+  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "decision-backend-impl",
+  "milestone": "M4",
+  "wave": 2,
+  "deps": [
+    "decision-cache-design-spike",
+    "semantic-threshold-consolidation"
+  ],
+  "scenarioRefs": [
+    "M4: Veto backend without model"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "pyproject.toml:28-31",
+    "AGENTS.md:79-85"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "tests/checkers/test_decision_backend.py",
+    "tests/checkers/test_semantic_check.py",
+    "tests/checkers/test_no_try_import_checker.py",
+    "tests/checkers/test_suppression_justification_checker.py",
+    "tests/assumptions/test_pylint_cache_semantics.py"
+  ],
+  "expectRed": [
+    "tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol",
+    "tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration",
+    "tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest",
+    "tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production",
+    "tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend",
+    "tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter",
+    "tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend",
+    "tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification",
+    "tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty",
+    "tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge",
+    "tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend",
+    "tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair",
+    "tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again",
+    "tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id",
+    "tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers",
+    "tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache",
+    "tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern",
+    "tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged",
+    "tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer"
+  ]
+}
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "src/python_setup_lint/checkers/_semantic.py:125-189",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "pyproject.toml:28-31",
+  "AGENTS.md:79-85"
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
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..db75fa8
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
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
+startedAt: 2026-11-09T02:48:16.636Z
+session: 01a1be34-da15-73f2-a993-2cf5f64627dd
+endedAt: 2026-11-09T03:13:19.581Z
+usage:
+  inputTokens: 159729
+  outputTokens: 62311
+  costUsd: 0.087402
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-48-17-173Z_01a1be34-da15-73f2-a993-2cf5f64627dd
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..54165a3
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml
@@ -0,0 +1,124 @@
+status: ok
+summary: "Implemented the veto DecisionBackend pipeline. New
+  checkers/_decision_backend.py(+.pyi) provides DECISION_THRESHOLD=0.5,
+  PROMPT_VERSION='prompt-v1', runtime-checkable DecisionBackend Protocol,
+  FakeBackend (default 1.0, 'fake-backend rev test prompt-v1'), a hermetic
+  get_backend() that returns None in production, honors
+  PYTHON_SETUP_LINT_DECISION_BACKEND only under PYTEST_CURRENT_TEST, emits
+  structlog 'decision_model_unavailable' (model+reason) once per process for
+  PYTHON_SETUP_LINT_DECISION_MODEL, and a once-per-process deprecation warning
+  for PYTHON_SETUP_LINT_RERANKER_MODEL. _base.py(+.pyi) adds
+  normalize_suppressed_codes (directive strip, code-token echo rejection, bare
+  text unchanged), a backend=None keyword on check_if_meaningful, and
+  heuristic-first veto semantics (brush-off never reaches the adapter/backend;
+  None backend leaves the heuristic verdict). _semantic.py(+.pyi) is rewritten
+  as a thin backend adapter: backend=None keyword, None mapping, 0.5 threshold,
+  in-process memo keyed by (justification, rule, model_id), zero disk writes, no
+  sentence-transformers reference. no_try_import _OPTIONAL_IMPORT_PATTERNS is
+  now empty, pyproject [semantic] is an empty placeholder, and uv.lock was
+  regenerated with zero sentence-transformers edge (80 packages remain)."
+target:
+  selectors:
+    - tests/checkers/test_decision_backend.py
+    - tests/checkers/test_semantic_check.py
+    - tests/checkers/test_no_try_import_checker.py
+    - tests/checkers/test_suppression_justification_checker.py
+    - tests/assumptions/test_pylint_cache_semantics.py
+  expectRed:
+    - tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id
+    - tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score
+    - tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol
+    - tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration
+    - tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest
+    - tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production
+    - tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+    - tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend
+    - tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter
+    - tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend
+    - tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification
+    - tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty
+    - tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge
+    - tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none
+    - tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend
+    - tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair
+    - tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again
+    - tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id
+    - tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers
+    - tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache
+    - tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern
+    - tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged
+    - tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer
+evidence:
+  - "Target files: `uv run pytest tests/checkers/test_decision_backend.py
+    tests/checkers/test_semantic_check.py
+    tests/checkers/test_no_try_import_checker.py
+    tests/checkers/test_suppression_justification_checker.py
+    tests/assumptions/test_pylint_cache_semantics.py -q` -> 120 passed (was 48
+    failed / 72 passed at test-first)."
+  - Exact declared expectRed selectors (33 node IDs) -> `33 passed in 0.61s`.
+  - "Full unit suite: `uv run pytest -q` -> 1377 passed, 13 deselected, 0 failed
+    (test-first baseline was 48 failed / 1329 passed); no regressions."
+  - "Project gate: `uv run lint` -> all 14 tools PASSED (tach, ruff format, ruff
+    check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright
+    verify types, pylint, pylint-pyi, pylint tests, detect-secrets), exit 0."
+  - "Behavior proof: brush-off with backend=recording -> False and backend.calls
+    == [] (never reaches adapter/backend); registered rejecting backend ->
+    False; one backend call per unique pair and distinct/other-model pairs call
+    again; backend None -> semantic returns None and check_if_meaningful returns
+    heuristic True."
+  - "Loader proof: no env -> None; dotted path honored only with
+    PYTEST_CURRENT_TEST and ignored in production;
+    PYTHON_SETUP_LINT_DECISION_MODEL yields None with exactly one warning across
+    two calls; PYTHON_SETUP_LINT_RERANKER_MODEL emits exactly one warning
+    containing 'deprecated'."
+  - "Packaging proof: `pyproject.toml` [project.optional-dependencies].semantic
+    == []; `uv lock --check` resolved 80 packages; `grep -c
+    sentence-transformers uv.lock` -> 0 matches (root entry has no semantic
+    extra edge)."
+  - "No-disk proof: test_check_writes_no_disk_cache and assumptions tests
+    confirm no cache dir/file is created;
+    test_checker_sources_given_source_tree_then_no_result_cache_writer finds no
+    result-cache writer in any checker .py."
+  - "Golden: `uv run pytest tests/integration.py -q` -> 8 passed, 1 failed
+    solely from 3 intended added findings ('pylint', 'pylint-pyi', 'pylint
+    tests' -> src/minimal_sample/mod.py:42 unjustified-suppression). Shift
+    reported; tests/data is forbidden for this story so the golden was not
+    regenerated."
+concerns:
+  - "Golden shift-reported (not regenerated): the code-echo fix adds 3 W9704
+    findings at tests/data/minimal_sample_project/src/minimal_sample/mod.py:42
+    for pylint, pylint-pyi, and pylint tests. Line 42's '# noqa:
+    unused-argument' was previously treated as justified by the preceding '#
+    pylint: disable=some-rule' directive (itself flagged at line 41);
+    normalize_suppressed_codes now correctly rejects a directive as a reason.
+    tests/data is FORBIDDEN by the assignment, so the golden snapshot remains at
+    the old state."
+  - uv.lock regeneration pruned 79 transitive packages (sentence-transformers,
+    torch/nvidia, transformers/huggingface-hub, httpx stack, scikit-learn/scipy,
+    etc.) because the empty [semantic] extra had no other consumers; 80 packages
+    remain and uv lock --check is consistent.
+  - "Two justified inline suppressions were added: ruff ARG002 on
+    FakeBackend.decide (deterministic fake ignores inputs) and pylint
+    trivial-wrapper on the two private test-reset helpers."
+  - "Module-size budget: all touched modules <= 500 lines (_decision_backend.py
+    100, _base.py 280, _semantic.py 48); net production line delta is +27
+    excluding uv.lock."
+notes: Implementation follows ADR-014 pinned values and ADR-010's test-only
+  dotted-path guard. No forbidden paths were touched (no
+  decisions/_decision_cache, _source_stream, ty.toml, tach.toml, tests/data,
+  .gitignore, hatch entry, or baseline). The new companion stub
+  src/python_setup_lint/checkers/_decision_backend.pyi is untracked/new and must
+  be included in the commit. The semantic adapter calls
+  _decision_backend.get_backend() through the module object so monkeypatched
+  loaders are honored, and check_if_meaningful imports the adapter lazily for
+  the same reason.
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/checks.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/checks.yaml
new file mode 100644
index 0000000..260b871
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/checks.yaml
@@ -0,0 +1,363 @@
+checks:
+  - id: gates
+    status: fail
+    message: "Gate regressions: test-integration"
+    details:
+      - id: format
+        command: uv run ruff format --check --config config/ruff.toml src tests
+        status: pass
+        durationMs: 219
+        details: 184 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 57518
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
+          Success: No issues found in 29 files (14ms)
+
+          ============================================================
+          [mypy] PASSED [5.4s]
+          ============================================================
+          Success: no issues found in 57 source files
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
+          [mypy.stubtest] PASSED [7.3s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [3.9s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794195774479",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 112,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 3.532
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
+          [pylint] PASSED [9.3s]
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
+          [pylint-pyi] PASSED [9.1s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [14.4s]
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
+          [detect-secrets] PASSED [6.0s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 31148
+        details: |-
+          [Tach] 1390 tests in 60 files unaffected by changes (~23.4s could be saved). Skip with: pytest --tach
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
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1377 passed, 13 deselected, 4 warnings in 29.14s
+          [Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]
+        improvements:
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+          - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+          - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      - id: test-integration
+        command: uv run pytest tests/integration.py -q
+        status: fail
+        durationMs: 102244
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~51.0s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          F........                                                                [100%]
+          =================================== FAILURES ===================================
+          _______________ TestMinimalSampleProject.test_setup_new_and_lint _______________
+
+          self = <tests.integration.TestMinimalSampleProject object at 0x74ab37813d90>
+          tmp_path = PosixPath('/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/pytest-of-slava/pytest-241/test_setup_new_and_lint0')
+          capsys = <_pytest.capture.CaptureFixture object at 0x74ab376a1fd0>
+          monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x74ab37608180>
+          isolated_runner_registries = None
+
+              def test_setup_new_and_lint(
+                  self,
+                  tmp_path: Path,
+                  capsys: pytest.CaptureFixture[str],
+                  monkeypatch: pytest.MonkeyPatch,
+                  isolated_runner_registries: None,
+              ) -> None:
+                  """Run lint on the sample project and pin every finding in the golden snapshot.
+              
+                  Asserts:
+                  - The first run exits non-zero, reports every tool section, does not
+                    crash, does not skip for unexpected reasons and fires W9705.
+                  - A dedicated
+          ... [truncated 3313 bytes] ...
+              def assert_matches_golden(findings: Sequence[Finding], *, golden_path: Path) -> None:
+                  """Assert *findings* equal the committed golden as a multiset.
+              
+                  With ``PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`` this rewrites the golden and its
+                  counts instead of comparing.  Under CI it fails rather than rewriting.
+                  """
+                  if os.environ.get(UPDATE_ENV) == "1":
+                      if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
+                          pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+                      warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+                      write_golden_files(golden_path, findings)
+                      return
+                  committed = read_golden(golden_path)
+                  added, removed = _diff_keys(findings, committed)
+                  if added or removed:
+          >           pytest.fail(_format_drift(added, removed, golden_path))
+          E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+          E           added (3):
+          E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+
+          tests/_golden.py:389: Failed
+          ========================= Tach Impact Analysis Warning =========================
+          [Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
+          [Tach] These failures would be missed when using --tach:
+          [Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
+          =========================== short test summary info ============================
+          FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+          added (3):
+            ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+            ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+            ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+          1 failed, 8 passed in 48.82s
+          [New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
+        failingTests:
+          - tests.integration.TestMinimalSampleProject.test_setup_new_and_lint
+    output: |-
+      get("GITHUB_ACTIONS"):
+                      pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+                  warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+                  write_golden_files(golden_path, findings)
+                  return
+              committed = read_golden(golden_path)
+              added, removed = _diff_keys(findings, committed)
+              if added or removed:
+      >           pytest.fail(_format_drift(added, removed, golden_path))
+      E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+      E           added (3):
+      E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+
+      tests/_golden.py:389: Failed
+      ========================= Tach Impact Analysis Warning =========================
+      [Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
+      [Tach] These failures would be missed when using --tach:
+      [Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
+      =========================== short test summary info ============================
+      FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+      added (3):
+        ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+        ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+        ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+      1 failed, 8 passed in 48.82s
+      [New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: uv run pytest tests/checkers/test_decision_backend.py
+        tests/checkers/test_semantic_check.py
+        tests/checkers/test_no_try_import_checker.py
+        tests/checkers/test_suppression_justification_checker.py
+        tests/assumptions/test_pylint_cache_semantics.py
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-green-1794195947850-azp6xgqcmyt.xml
+      junitCaseCount: 120
+      junitCaseIds:
+        - tests.checkers.test_decision_backend.test_decision_threshold_is_pinned_at_half
+        - tests.checkers.test_decision_backend.test_prompt_version_is_pinned
+        - tests.checkers.test_decision_backend.test_fake_backend_defaults_to_one_and_pinned_model_id
+        - tests.checkers.test_decision_backend.test_fake_backend_returns_configured_score
+        - tests.checkers.test_decision_backend.test_fake_backend_satisfies_protocol
+        - tests.checkers.test_decision_backend.test_get_backend_is_none_without_configuration
+        - tests.checkers.test_decision_backend.test_get_backend_honors_dotted_path_under_pytest
+        - tests.checkers.test_decision_backend.test_get_backend_ignores_dotted_path_in_production
+        - tests.checkers.test_decision_backend.test_decision_model_parses_but_yields_none_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_reranker_model_env_is_deprecated_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+        - tests.checkers.test_decision_backend.test_registered_backend_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_brush_off_is_vetoed_before_the_backend
+        - tests.checkers.test_decision_backend.test_brush_off_does_not_reach_the_semantic_adapter
+        - tests.checkers.test_decision_backend.test_meaningful_heuristic_is_confirmed_by_backend
+        - tests.checkers.test_decision_backend.test_backend_below_threshold_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_loader_none_falls_back_to_the_heuristic
+        - tests.checkers.test_decision_backend.test_semantic_disabled_never_calls_the_backend
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment]  #
+          assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment,arg-type]  #
+          arg-type, assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[noqa: E501, W9704  # W9704,E501]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _keeps_a_real_reason[type: ignore[assignment]  # carried from library
+          httpx for type compatibility]"
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_keeps_a_real_reason[carried
+          from library httpx for type compatibility]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[W9704,E501-W9704,E501]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[assignment-assignment]
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_rejects_code_echo_justification
+        - tests.checkers.test_decision_backend.test_semantic_extra_is_empty
+        - tests.checkers.test_decision_backend.test_uv_lock_has_no_sentence_transformers_edge
+        - tests.checkers.test_semantic_check.test_signature_exposes_backend_keyword_defaulting_to_none
+        - tests.checkers.test_semantic_check.test_empty_primary_returns_false_without_calling_backend
+        - tests.checkers.test_semantic_check.test_loader_none_maps_to_none
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.0-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.499-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.5-True]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[1.0-True]
+        - tests.checkers.test_semantic_check.test_one_backend_call_per_unique_pair
+        - tests.checkers.test_semantic_check.test_distinct_pairs_call_backend_again
+        - tests.checkers.test_semantic_check.test_memo_key_includes_backend_model_id
+        - tests.checkers.test_semantic_check.test_module_does_not_reference_sentence_transformers
+        - tests.checkers.test_semantic_check.test_check_writes_no_disk_cache
+        - tests.checkers.test_no_try_import_checker.test_sentence_transformers_is_no_longer_an_optional_import_pattern
+        - tests.checkers.test_no_try_import_checker.test_try_import_of_sentence_transformers_is_flagged
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_modulenotfound]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[from_import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_bare_except]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_tuple_import_errors]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_try_blocks]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_handlers_one_try]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_non_import_handler_not_flagged]
+      junitTruncated: true
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 299/300 production lines changed"
+    details:
+      changedLines:
+        added: 133
+        deleted: 166
+        total: 299
+        files:
+          - src/python_setup_lint/checkers/_base.py
+          - src/python_setup_lint/checkers/_base.pyi
+          - src/python_setup_lint/checkers/_decision_backend.py
+          - src/python_setup_lint/checkers/_decision_backend.pyi
+          - src/python_setup_lint/checkers/_semantic.py
+          - src/python_setup_lint/checkers/_semantic.pyi
+          - src/python_setup_lint/checkers/conformance/no_try_import_checker.py
+      limit: 300
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/input.md b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/input.md
new file mode 100644
index 0000000..db1fd1d
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/input.md
@@ -0,0 +1,140 @@
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
+  "slug": "decision-backend-impl",
+  "kind": "dev",
+  "title": "Implement veto DecisionBackend with FakeBackend",
+  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "decision-backend-impl",
+  "milestone": "M4",
+  "wave": 2,
+  "deps": [
+    "decision-cache-design-spike",
+    "semantic-threshold-consolidation"
+  ],
+  "scenarioRefs": [
+    "M4: Veto backend without model"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "pyproject.toml:28-31",
+    "AGENTS.md:79-85"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "tests/checkers/test_decision_backend.py",
+    "tests/checkers/test_semantic_check.py",
+    "tests/checkers/test_no_try_import_checker.py",
+    "tests/checkers/test_suppression_justification_checker.py",
+    "tests/assumptions/test_pylint_cache_semantics.py"
+  ],
+  "expectRed": [
+    "tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol",
+    "tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration",
+    "tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest",
+    "tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production",
+    "tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend",
+    "tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter",
+    "tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend",
+    "tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification",
+    "tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty",
+    "tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge",
+    "tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend",
+    "tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair",
+    "tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again",
+    "tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id",
+    "tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers",
+    "tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache",
+    "tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern",
+    "tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged",
+    "tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer"
+  ]
+}
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "src/python_setup_lint/checkers/_semantic.py:125-189",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "pyproject.toml:28-31",
+  "AGENTS.md:79-85"
+]
+
+## Review Feedback
+Failing check: size
+
+Message: Production changes (444 lines) exceeded limit (300 lines) for kind dev
+
+Detail:
+{
+  "changedLines": {
+    "added": 251,
+    "deleted": 193,
+    "total": 444,
+    "files": [
+      "src/python_setup_lint/checkers/_base.py",
+      "src/python_setup_lint/checkers/_base.pyi",
+      "src/python_setup_lint/checkers/_decision_backend.py",
+      "src/python_setup_lint/checkers/_semantic.py",
+      "src/python_setup_lint/checkers/_semantic.pyi",
+      "src/python_setup_lint/checkers/conformance/no_try_import_checker.py",
+      "src/python_setup_lint/checkers/_decision_backend.pyi"
+    ]
+  },
+  "limit": 300
+}
+
+Budget: 444 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/meta.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/meta.yaml
new file mode 100644
index 0000000..9b43150
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/meta.yaml
@@ -0,0 +1,19 @@
+seq: 4
+name: develop
+attempt: 2
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: rejected
+startedAt: 2026-11-09T03:13:24.500Z
+session: 01a1be4b-dc31-77c5-9306-76452252bdc5
+endedAt: 2026-11-09T03:45:50.344Z
+usage:
+  inputTokens: 209913
+  outputTokens: 106336
+  costUsd: 0.129098
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-13-25-041Z_01a1be4b-dc31-77c5-9306-76452252bdc5
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/output.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/output.yaml
new file mode 100644
index 0000000..a5a8399
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/output.yaml
@@ -0,0 +1,113 @@
+status: ok
+summary: "Implemented the veto DecisionBackend and rewrote the semantic adapter,
+  then compressed the production diff from 444 to 299 lines (item-base metric)
+  without changing behavior. Backend: pinned
+  DECISION_THRESHOLD=0.5/PROMPT_VERSION=prompt-v1, FakeBackend (1.0,
+  'fake-backend rev test prompt-v1'), PYTEST_CURRENT_TEST-guarded dotted-path
+  loader, structlog once-per-process deprecation/model warnings, production
+  returns None. _semantic.py: digest-keyed in-process memo, one backend call per
+  unique (justification, rule, model) triple, no disk cache, no
+  sentence-transformers reference. _base.py: heuristic-first gate,
+  normalize_suppressed_codes (directive stripping + order-insensitive code-echo
+  rejection), backend kwarg defaulting to None, backend may only veto.
+  _base.pyi/_semantic.pyi/_decision_backend.pyi updated and stale
+  NLP/sentence-transformers docs removed; no_try_import optional-pattern set
+  emptied (committed in a1). All 120 target tests pass; full unit suite and all
+  14 lint tools pass. Integration golden shows the intended 3-finding shift at
+  the bare-noqa line, reported below because tests/data is out of scope for this
+  item."
+target:
+  selectors:
+    - tests/checkers/test_decision_backend.py
+    - tests/checkers/test_semantic_check.py
+    - tests/checkers/test_no_try_import_checker.py
+    - tests/checkers/test_suppression_justification_checker.py
+    - tests/assumptions/test_pylint_cache_semantics.py
+  expectRed:
+    - tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id
+    - tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score
+    - tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol
+    - tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration
+    - tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest
+    - tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production
+    - tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+    - tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend
+    - tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter
+    - tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend
+    - tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic
+    - tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification
+    - tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty
+    - tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge
+    - tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none
+    - tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend
+    - tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair
+    - tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again
+    - tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id
+    - tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers
+    - tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache
+    - tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern
+    - tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged
+    - tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer
+evidence:
+  - Size gate metric reconstructed from the a1 review (444 = full new backend
+    file + diff vs item base fc2770d); final `git diff --numstat fc2770d -- src`
+    = 133 added + 166 deleted = 299 <= 300.
+  - "Target suite: `uv run pytest -q tests/checkers/test_decision_backend.py
+    tests/checkers/test_semantic_check.py
+    tests/checkers/test_no_try_import_checker.py
+    tests/checkers/test_suppression_justification_checker.py
+    tests/assumptions/test_pylint_cache_semantics.py` -> 120 passed."
+  - "Full unit suite: `uv run pytest -q` -> 1377 passed, 13 deselected."
+  - "Full gate: `uv run lint` -> EXIT=0, all 14 tools PASSED (tach, ruff format,
+    ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright
+    verify types, pylint, pylint-pyi, pylint tests, detect-secrets)."
+  - Ruff format with project config on all 7 changed files -> 7 files already
+    formatted; `ruff check --config config/ruff.toml` on all changed files ->
+    All checks passed.
+  - "`uv run pylint --rcfile config/.pylintrc-pyi` on
+    _base.pyi/_semantic.pyi/_decision_backend.pyi -> 10.00/10 (justified
+    missing-beartype and generic-return-requires-returns inline suppressions
+    accepted, no useless-suppression)."
+  - "Behavior spot-checks: 11 selected expected-red cases passed, including
+    pinned FakeBackend, exactly-one model warning, brush-off veto, empty
+    [semantic] extra, uv.lock no sentence-transformers edge,
+    one-call-per-unique-pair, and any-element code echo."
+  - "Integration: `uv run pytest tests/integration.py -q` -> 8 passed, 1 failed
+    only on the reported golden shift (3 added W9704 findings at
+    src/minimal_sample/mod.py:42 for pylint, pylint tests, pylint-pyi)."
+concerns:
+  - "Golden shift (reported, not fixed): the sample project's bare `# noqa:
+    unused-argument` at src/minimal_sample/mod.py:42 is now correctly rejected
+    as a code-only suppression with no technical reason, adding 3 W9704 findings
+    (pylint, pylint tests, pylint-pyi). tests/data is explicitly forbidden to
+    this item, so the golden snapshot update is owed to the golden-snapshot
+    owner; the integration assertion only pins the brush-off (line 49) and
+    carry-from (line 56) behaviors, which still pass. The shift occurs with
+    PYTHON_SETUP_LINT_SEMANTIC=0 as well, matching the new code-echo tests."
+  - "Budget-driven doc compression: _decision_backend.pyi carries type
+    signatures without docstrings, and _base.pyi's normalize_suppressed_codes
+    doc is a single line plus a justified `generic-return-requires-returns`
+    disable. Public FakeBackend.decide uses an inline `pylint:
+    disable=missing-beartype` (deterministic test double ignores inputs) instead
+    of @beartype; the protocol method does the same because beartype never
+    validates protocol declarations."
+  - _semantic.py retains the original in-process memo shape (sha256 digest of
+    primary/rule/context/model_id -> bool) rather than a tuple key, to keep the
+    rewrite compact; the memo is process-only, reset by _reset_cache, and
+    tolerant of the assumptions test pinning _RESULT_CACHE=None.
+notes: "Compression path: a1 measured 429 by plain git diff but 444 by the gate
+  because the two _decision_backend files are new relative to the item base
+  fc2770d and are counted at full size. The final tree is 299 by that same
+  metric. Implementations preserve all pinned ADR-014 values (threshold 0.5,
+  prompt-v1, FakeBackend 1.0/model id, None fallback, one call per unique pair)
+  and ADR-010 loader semantics (PYTEST_CURRENT_TEST guard, dotted path,
+  production None, once-per-process warnings)."
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..1245308
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/checks.yaml
@@ -0,0 +1,285 @@
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
+        durationMs: 237
+        details: 184 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: pass
+        durationMs: 58819
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
+          Success: No issues found in 29 files (14ms)
+
+          ============================================================
+          [mypy] PASSED [4.7s]
+          ============================================================
+          Success: no issues found in 57 source files
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
+          [mypy.stubtest] PASSED [6.8s]
+          ============================================================
+
+          ============================================================
+          [pyright check] PASSED [3.9s]
+          ============================================================
+          {
+              "version": "1.1.410",
+              "time": "1794197329050",
+              "generalDiagnostics": [],
+              "summary": {
+                  "filesAnalyzed": 112,
+                  "errorCount": 0,
+                  "warningCount": 0,
+                  "informationCount": 0,
+                  "timeInSec": 3.45
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
+          [pylint] PASSED [8.9s]
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
+          [pylint-pyi] PASSED [8.8s]
+          ============================================================
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] PASSED [16.3s]
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
+          [detect-secrets] PASSED [7.4s]
+          ============================================================
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 33193
+        details: |-
+          [Tach] 1391 tests in 60 files unaffected by changes (~29.8s could be saved). Skip with: pytest --tach
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
+          ..........                                                               [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1378 passed, 13 deselected, 4 warnings in 30.82s
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
+        durationMs: 67532
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~1m 4s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 66.39s (0:01:06)
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: uv run pytest tests/checkers/test_decision_backend.py
+        tests/checkers/test_semantic_check.py
+        tests/checkers/test_no_try_import_checker.py
+        tests/checkers/test_suppression_justification_checker.py
+        tests/assumptions/test_pylint_cache_semantics.py
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-green-1794197472389-1d02mb0ahp7.xml
+      junitCaseCount: 121
+      junitCaseIds:
+        - tests.checkers.test_decision_backend.test_decision_threshold_is_pinned_at_half
+        - tests.checkers.test_decision_backend.test_prompt_version_is_pinned
+        - tests.checkers.test_decision_backend.test_fake_backend_defaults_to_one_and_pinned_model_id
+        - tests.checkers.test_decision_backend.test_fake_backend_returns_configured_score
+        - tests.checkers.test_decision_backend.test_fake_backend_satisfies_protocol
+        - tests.checkers.test_decision_backend.test_get_backend_is_none_without_configuration
+        - tests.checkers.test_decision_backend.test_get_backend_honors_dotted_path_under_pytest
+        - tests.checkers.test_decision_backend.test_get_backend_ignores_dotted_path_in_production
+        - tests.checkers.test_decision_backend.test_decision_model_parses_but_yields_none_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_reranker_model_env_is_deprecated_with_exactly_one_warning
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_has_backend_keyword_defaulting_to_none
+        - tests.checkers.test_decision_backend.test_registered_backend_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_brush_off_is_vetoed_before_the_backend
+        - tests.checkers.test_decision_backend.test_brush_off_does_not_reach_the_semantic_adapter
+        - tests.checkers.test_decision_backend.test_meaningful_heuristic_is_confirmed_by_backend
+        - tests.checkers.test_decision_backend.test_backend_below_threshold_rejects_a_meaningful_heuristic
+        - tests.checkers.test_decision_backend.test_loader_none_falls_back_to_the_heuristic
+        - tests.checkers.test_decision_backend.test_semantic_disabled_never_calls_the_backend
+        - tests.checkers.test_decision_backend.test_bare_directive_stays_meaningful_when_semantic_disabled
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment]  #
+          assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[type: ignore[assignment,arg-type]  #
+          arg-type, assignment]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _drops_reason_that_echoes_codes[noqa: E501, W9704  # W9704,E501]"
+        - "tests.checkers.test_decision_backend.test_normalize_suppressed_codes\
+          _keeps_a_real_reason[type: ignore[assignment]  # carried from library
+          httpx for type compatibility]"
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_keeps_a_real_reason[carried
+          from library httpx for type compatibility]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[W9704,E501-W9704,E501]
+        - tests.checkers.test_decision_backend.test_normalize_suppressed_codes_leaves_bare_text_unchanged[assignment-assignment]
+        - tests.checkers.test_decision_backend.test_check_if_meaningful_rejects_code_echo_justification
+        - tests.checkers.test_decision_backend.test_semantic_extra_is_empty
+        - tests.checkers.test_decision_backend.test_uv_lock_has_no_sentence_transformers_edge
+        - tests.checkers.test_semantic_check.test_signature_exposes_backend_keyword_defaulting_to_none
+        - tests.checkers.test_semantic_check.test_empty_primary_returns_false_without_calling_backend
+        - tests.checkers.test_semantic_check.test_loader_none_maps_to_none
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.0-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.499-False]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[0.5-True]
+        - tests.checkers.test_semantic_check.test_backend_score_maps_at_pinned_threshold[1.0-True]
+        - tests.checkers.test_semantic_check.test_one_backend_call_per_unique_pair
+        - tests.checkers.test_semantic_check.test_distinct_pairs_call_backend_again
+        - tests.checkers.test_semantic_check.test_memo_key_includes_backend_model_id
+        - tests.checkers.test_semantic_check.test_module_does_not_reference_sentence_transformers
+        - tests.checkers.test_semantic_check.test_check_writes_no_disk_cache
+        - tests.checkers.test_no_try_import_checker.test_sentence_transformers_is_no_longer_an_optional_import_pattern
+        - tests.checkers.test_no_try_import_checker.test_try_import_of_sentence_transformers_is_flagged
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_except_modulenotfound]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[from_import_in_try_except_importerror]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_bare_except]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[import_in_try_tuple_import_errors]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_try_blocks]
+        - tests.checkers.test_no_try_import_checker.test_checker_given_try_except_import_pattern_then_flags_violation[two_imports_separate_handlers_one_try]
+      junitTruncated: true
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 299/300 production lines changed"
+    details:
+      changedLines:
+        added: 133
+        deleted: 166
+        total: 299
+        files:
+          - src/python_setup_lint/checkers/_base.py
+          - src/python_setup_lint/checkers/_base.pyi
+          - src/python_setup_lint/checkers/_decision_backend.py
+          - src/python_setup_lint/checkers/_decision_backend.pyi
+          - src/python_setup_lint/checkers/_semantic.py
+          - src/python_setup_lint/checkers/_semantic.pyi
+          - src/python_setup_lint/checkers/conformance/no_try_import_checker.py
+      limit: 300
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/input.md b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/input.md
new file mode 100644
index 0000000..02a8e76
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/input.md
@@ -0,0 +1,161 @@
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
+  "slug": "decision-backend-impl",
+  "kind": "dev",
+  "title": "Implement veto DecisionBackend with FakeBackend",
+  "assignment": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
+  "outlineRef": "decision-backend-impl",
+  "milestone": "M4",
+  "wave": 2,
+  "deps": [
+    "decision-cache-design-spike",
+    "semantic-threshold-consolidation"
+  ],
+  "scenarioRefs": [
+    "M4: Veto backend without model"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "src/python_setup_lint/checkers/_base.py:142-158",
+    "pyproject.toml:28-31",
+    "AGENTS.md:79-85"
+  ],
+  "escalate": true
+}
+
+## Target
+{
+  "selectors": [
+    "tests/checkers/test_decision_backend.py",
+    "tests/checkers/test_semantic_check.py",
+    "tests/checkers/test_no_try_import_checker.py",
+    "tests/checkers/test_suppression_justification_checker.py",
+    "tests/assumptions/test_pylint_cache_semantics.py"
+  ],
+  "expectRed": [
+    "tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score",
+    "tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol",
+    "tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration",
+    "tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest",
+    "tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production",
+    "tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend",
+    "tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter",
+    "tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend",
+    "tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic",
+    "tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend",
+    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification",
+    "tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty",
+    "tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge",
+    "tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none",
+    "tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend",
+    "tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair",
+    "tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again",
+    "tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id",
+    "tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers",
+    "tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache",
+    "tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern",
+    "tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged",
+    "tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free",
+    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer"
+  ]
+}
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "src/python_setup_lint/checkers/_semantic.py:125-189",
+  "src/python_setup_lint/checkers/_base.py:142-158",
+  "pyproject.toml:28-31",
+  "AGENTS.md:79-85"
+]
+
+## Review Feedback
+Fix in this order (zero tests/data writes; golden-regen-hatch is sole golden writer; no shift report — this is a no-shift bug): (1) Preserve SEMANTIC=0 exactly: keep `os.environ.get('PYTHON_SETUP_LINT_SEMANTIC','1')=='1'` guard; when '0', skip semantic/backend entirely and return the heuristic bool directly. (2) Restore heuristic byte-identical to _base.py:160-238: primary=(comment or text).strip(); empty/<5 False; exact `primary_lower in boilerplate` (50-entry, no word-split/substring); exact `primary_lower in meaningless_phrases` (no substring); rule-echo only as `primary_lower == any(element_lower)` over normalize_suppressed_codes(rule).split(',') — no suppression-pattern rejection, no extra boilerplate. Nachweis: check_if_meaningful('pylint: disable=some-rule', rule='unjustified-suppression', code_context='def _bare_suppression() -> None:', comment=same) with SEMANTIC=0 must be True (preceding-suppression quirk from suppression_justification_checker.py:377-386; checker-level fix belongs to checkers-legacy, not backend). (3) None mapping: semantic_check returns None (not False) when loader/backend None; veto heuristic AND (prob>=0.5) only when backend returns float. (4) Revert any test asserts of the buggy False for line-42-style reasons; keep test_decision_backend.py but pin SEMANTIC=0 preservation. Minimize tests/assumptions + test_semantic_check churn (full rewrite is semantic-tests-rewrite via dep). (5) Verify: `uv run pytest tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint -q` golden hash-equal (line 41 only, no line 42); `uv run pytest -q` no new failures vs M1 table; uv.lock still resolves.
+
+Failing check: gates
+
+Message: Gate regressions: test-integration
+
+Detail:
+olden_path}\")\n            warnings.warn(f\"updating golden files for {golden_path}\", stacklevel=2)\n            write_golden_files(golden_path, findings)\n            return\n        committed = read_golden(golden_path)\n        added, removed = _diff_keys(findings, committed)\n        if added or removed:\n>           pytest.fail(_format_drift(added, removed, golden_path))\nE           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nE           added (3):\nE             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n\ntests/_golden.py:389: Failed\n========================= Tach Impact Analysis Warning =========================\n[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!\n[Tach] These failures would be missed when using --tach:\n[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint\n=========================== short test summary info ============================\nFAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nadded (3):\n  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n1 failed, 8 passed in 48.82s\n[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]",
+    "failingTests": [
+      "tests.integration.TestMinimalSampleProject.test_setup_new_and_lint"
+    ]
+  }
+]
+
+Output tail:
+get("GITHUB_ACTIONS"):
+                pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+            warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+            write_golden_files(golden_path, findings)
+            return
+        committed = read_golden(golden_path)
+        added, removed = _diff_keys(findings, committed)
+        if added or removed:
+>           pytest.fail(_format_drift(added, removed, golden_path))
+E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+E           added (3):
+E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+
+tests/_golden.py:389: Failed
+========================= Tach Impact Analysis Warning =========================
+[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
+[Tach] These failures would be missed when using --tach:
+[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
+=========================== short test summary info ============================
+FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
+added (3):
+  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
+1 failed, 8 passed in 48.82s
+[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
+
+Budget: 299 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.
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
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..9d0c43e
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 5
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
+startedAt: 2026-11-09T03:58:01.571Z
+session: 01a1be74-b4b5-72c6-bf2a-05eed2397a73
+endedAt: 2026-11-09T04:11:15.227Z
+usage:
+  inputTokens: 80359
+  outputTokens: 32251
+  costUsd: 0.037485
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-58-01-909Z_01a1be74-b4b5-72c6-bf2a-05eed2397a73
diff --git a/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..9415e8c
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-backend-impl/steps/005-develop-r1-a1/output.yaml
@@ -0,0 +1,71 @@
+status: ok
+summary: Fixed the golden regression by making suppressed-code normalization
+  distinguish "directive with no reason" from "reason that merely echoes the
+  codes". `_base.normalize_suppressed_codes` now returns the raw comment when a
+  directive carries no reason (restoring the pre-change heuristic outcome,
+  including the golden's preceding-suppression quirk) while still returning ""
+  when the reason only echoes the suppressed codes (preserving W9704 code-echo
+  rejection). `check_if_meaningful` keeps `primary =
+  normalize_suppressed_codes(comment or text).strip()`, the
+  `PYTHON_SETUP_LINT_SEMANTIC != "1"` early-return (backend never touched when
+  SEMANTIC=0), the None-loading path (semantic returns None -> heuristic True),
+  and rule-echo via elements of `normalize_suppressed_codes(rule).split(",")`.
+  Added a regression test pinning the SEMANTIC=0 bare-directive acceptance. All
+  target selectors, the full unit suite, the previously failing integration
+  golden gate, and the 14-tool lint gate pass.
+target:
+  selectors:
+    - tests/checkers/test_decision_backend.py
+    - tests/checkers/test_semantic_check.py
+    - tests/checkers/test_no_try_import_checker.py
+    - tests/checkers/test_suppression_justification_checker.py
+    - tests/assumptions/test_pylint_cache_semantics.py
+  expectRed:
+    - tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id
+    - tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest
+    - tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production
+    - tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification
+    - tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair
+    - tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged
+    - tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected
+    - tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing
+evidence:
+  - "`uv run pytest
+    \"tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint\"
+    -q` -> 1 passed in 36.61s; golden findings hash-equal (the 3 added line-42
+    'unjustified-suppression' records are gone, line 41 record retained)."
+  - "`uv run pytest -q` -> 1377 passed, 13 deselected, 0 failed (35.17s) — no
+    new failures vs M1 table."
+  - "Target selectors: `uv run pytest tests/checkers/test_decision_backend.py
+    tests/checkers/test_semantic_check.py
+    tests/checkers/test_no_try_import_checker.py
+    tests/checkers/test_suppression_justification_checker.py
+    tests/assumptions/test_pylint_cache_semantics.py -q` -> 121 passed, 0
+    failed."
+  - "Manual SEMANTIC=0 probe: normalize('pylint: disable=some-rule') == 'pylint:
+    disable=some-rule'; check_if_meaningful(same,
+    rule='unjustified-suppression', code_context='def _bare_suppression() ->
+    None:', comment=same) is True; 'type: ignore[assignment]  # assignment' is
+    False; 'type: ignore[assignment]  # carried from library httpx for type
+    compatibility' is True."
+  - "`uv run lint` -> all 14 tools PASSED (tach, ruff format, ruff check, rumdl,
+    mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types,
+    pylint, pylint-pyi, pylint tests, detect-secrets), exit code 0."
+  - "`git status --short` -> only src/python_setup_lint/checkers/_base.py,
+    src/python_setup_lint/checkers/_base.pyi,
+    tests/checkers/test_decision_backend.py modified; tests/data/golden and
+    uv.lock untouched."
+concerns:
+  - "Prod-line budget stays at the prior 299: all production edits are in-place
+    line-for-line replacements (no net added prod lines) in already-changed
+    lines of _base.py/_base.pyi."
+  - test_check_if_meaningful_rejects_code_echo_justification and
+    TestAnyElementCodeEcho keep passing because echo detection remains in the
+    heuristic via normalize_suppressed_codes; removing normalization entirely
+    proved to break 6 target tests (verified experimentally, then reverted).
+notes: 'Behavior split implemented in normalize_suppressed_codes: no reason
+  tokens -> raw comment (pre-quirk behavior); reason tokens subset of suppressed
+  codes -> "" (code echo -> W9704); otherwise the real reason.
+  check_if_meaningful keeps the SEMANTIC guard before any semantic/backend call,
+  so SEMANTIC=0 returns the heuristic bool directly and never resolves a
+  backend.'
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index e5ef86f..77b64c0 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -1553,67 +1553,3 @@
 {"type":"step_started","task":"modernize","step":"architect-wave-report-4-1","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/runs/097-architect-wave-report-4-1-a1","ts":"2026-11-09T01:55:39.640Z"}
 {"type":"step_timeout_armed","task":"modernize","step":"architect-wave-report-4-1","timeoutSec":7200,"ts":"2026-11-09T01:55:39.644Z"}
 {"type":"step_transcript_size_warning","task":"modernize","step":"architect-wave-report-4-1","attempt":1,"sizeBytes":13505742,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl","ts":"2026-11-09T01:56:59.695Z"}
-{"type":"step_finished","task":"modernize","step":"architect-wave-report-4-1","attempt":1,"status":"ok","sessionId":"01a1b8a3-f9ce-7511-963e-37a3531a2d3a","usage":{"inputTokens":878208,"outputTokens":2209,"costUsd":0.088263},"ts":"2026-11-09T01:56:59.793Z"}
-{"type":"wave_started","wave":2,"iteration":4,"ts":"2026-11-09T01:57:02.761Z"}
-{"type":"step_started","task":"modernize","item":"runner-compat-shim-removal","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/001-develop-r1-a1","ts":"2026-11-09T01:59:08.032Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"runner-compat-shim-removal","step":"develop","timeoutSec":5400,"ts":"2026-11-09T01:59:08.038Z"}
-{"type":"step_started","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1","ts":"2026-11-09T01:59:08.162Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"decision-backend-impl","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T01:59:08.170Z"}
-{"type":"step_started","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-stream-helper/.factory/tasks/modernize/items/checkers-stream-helper/steps/001-develop-r1-a1","ts":"2026-11-09T01:59:08.356Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-stream-helper","step":"develop","timeoutSec":5400,"ts":"2026-11-09T01:59:08.366Z"}
-{"type":"step_started","task":"modernize","item":"checkers-factories-split","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/.factory/tasks/modernize/items/checkers-factories-split/steps/001-develop-r1-a1","ts":"2026-11-09T01:59:08.526Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-factories-split","step":"develop","timeoutSec":5400,"ts":"2026-11-09T01:59:08.534Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"runner-compat-shim-removal","step":"develop","attempt":1,"sizeBytes":5877884,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-527Z_01a1be07-dbef-71d0-88ff-84a482e0252f","ts":"2026-11-09T02:12:09.898Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"runner-compat-shim-removal","step":"develop","attempt":1,"toolCalls":67,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-527Z_01a1be07-dbef-71d0-88ff-84a482e0252f","ts":"2026-11-09T02:12:09.900Z"}
-{"type":"step_finished","task":"modernize","item":"runner-compat-shim-removal","step":"develop","attempt":1,"status":"ok","sessionId":"01a1be07-dbef-71d0-88ff-84a482e0252f","usage":{"inputTokens":74502,"outputTokens":30014,"costUsd":0.037697},"ts":"2026-11-09T02:16:27.958Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"sizeBytes":12769823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-09-093Z_01a1be07-de25-7286-a5de-ca73a4a6525d.jsonl","ts":"2026-11-09T02:17:11.281Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"toolCalls":135,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-09-093Z_01a1be07-de25-7286-a5de-ca73a4a6525d.jsonl","ts":"2026-11-09T02:17:11.281Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"checkers-factories-split","step":"develop","attempt":1,"sizeBytes":15028137,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-09-202Z_01a1be07-de92-76b0-a077-d5797a333431","ts":"2026-11-09T02:20:01.684Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"checkers-factories-split","step":"develop","attempt":1,"toolCalls":94,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-09-202Z_01a1be07-de92-76b0-a077-d5797a333431","ts":"2026-11-09T02:20:01.685Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"status":"ok","sessionId":"01a1be07-de25-7286-a5de-ca73a4a6525d","usage":{"inputTokens":147008,"outputTokens":52458,"costUsd":0.076653},"ts":"2026-11-09T02:20:27.361Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-factories-split","step":"develop","attempt":1,"status":"ok","sessionId":"01a1be07-de92-76b0-a077-d5797a333431","usage":{"inputTokens":139944,"outputTokens":56009,"costUsd":0.072803},"ts":"2026-11-09T02:22:47.426Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":1,"sizeBytes":22580876,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-776Z_01a1be07-dce8-748f-806e-bc484bc28d84","ts":"2026-11-09T02:27:01.004Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":1,"toolCalls":178,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T01-59-08-776Z_01a1be07-dce8-748f-806e-bc484bc28d84","ts":"2026-11-09T02:27:01.005Z"}
-{"type":"step_finished","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":1,"status":"rejected","sessionId":"01a1be07-dce8-748f-806e-bc484bc28d84","usage":{"inputTokens":235859,"outputTokens":98651,"costUsd":0.159634},"ts":"2026-11-09T02:27:05.489Z"}
-{"type":"step_started","task":"modernize","item":"runner-compat-shim-removal","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/002-qa-r1-a1","ts":"2026-11-09T02:27:10.611Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"runner-compat-shim-removal","step":"qa","timeoutSec":5400,"ts":"2026-11-09T02:27:10.640Z"}
-{"type":"step_started","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-stream-helper/.factory/tasks/modernize/items/checkers-stream-helper/steps/002-qa-r1-a1","ts":"2026-11-09T02:27:10.664Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-stream-helper","step":"qa","timeoutSec":5400,"ts":"2026-11-09T02:27:10.696Z"}
-{"type":"step_started","task":"modernize","item":"checkers-factories-split","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-factories-split/.factory/tasks/modernize/items/checkers-factories-split/steps/002-review-r1-a1","ts":"2026-11-09T02:27:10.727Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-factories-split","step":"review","timeoutSec":3600,"ts":"2026-11-09T02:27:10.738Z"}
-{"type":"step_started","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":2,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2","ts":"2026-11-09T02:27:10.790Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"decision-backend-impl","step":"test-first","timeoutSec":5400,"ts":"2026-11-09T02:27:10.799Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":2,"sizeBytes":5805310,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-572Z_01a1be21-8a54-776a-b0b7-7e49004123d8","ts":"2026-11-09T02:30:58.437Z"}
-{"type":"step_finished","task":"modernize","item":"decision-backend-impl","step":"test-first","attempt":2,"status":"ok","sessionId":"01a1be21-8a54-776a-b0b7-7e49004123d8","usage":{"inputTokens":55630,"outputTokens":28540,"costUsd":0.029351},"ts":"2026-11-09T02:31:02.595Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"checkers-factories-split","step":"review","attempt":1,"sizeBytes":5503796,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-426Z_01a1be21-89c2-7579-8f96-0930feb0300c.jsonl","ts":"2026-11-09T02:32:13.703Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-factories-split","step":"review","attempt":1,"status":"ok","sessionId":"01a1be21-89c2-7579-8f96-0930feb0300c","usage":{"inputTokens":134146,"outputTokens":14139,"costUsd":0.018085},"ts":"2026-11-09T02:32:13.786Z"}
-{"type":"step_finished","task":"modernize","item":"runner-compat-shim-removal","step":"qa","attempt":1,"status":"ok","sessionId":"01a1be21-8919-71be-8119-0c48e83efd6d","usage":{"inputTokens":41931,"outputTokens":33172,"costUsd":0.011981},"ts":"2026-11-09T02:33:42.447Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"sizeBytes":13339748,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-269Z_01a1be21-8925-75b2-87c2-c45d2895ebe8","ts":"2026-11-09T02:48:12.101Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"toolCalls":116,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-27-11-269Z_01a1be21-8925-75b2-87c2-c45d2895ebe8","ts":"2026-11-09T02:48:12.102Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"status":"ok","sessionId":"01a1be21-8925-75b2-87c2-c45d2895ebe8","usage":{"inputTokens":84487,"outputTokens":47404,"costUsd":0.022011},"ts":"2026-11-09T02:48:12.181Z"}
-{"type":"step_started","task":"modernize","item":"runner-compat-shim-removal","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-compat-shim-removal/.factory/tasks/modernize/items/runner-compat-shim-removal/steps/003-review-r1-a1","ts":"2026-11-09T02:48:16.688Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"runner-compat-shim-removal","step":"review","timeoutSec":3600,"ts":"2026-11-09T02:48:16.693Z"}
-{"type":"step_started","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1","ts":"2026-11-09T02:48:16.730Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"decision-backend-impl","step":"develop","timeoutSec":5400,"ts":"2026-11-09T02:48:16.744Z"}
-{"type":"step_started","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-stream-helper/.factory/tasks/modernize/items/checkers-stream-helper/steps/003-develop-r2-a1","ts":"2026-11-09T02:48:16.786Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-stream-helper","step":"develop","timeoutSec":5400,"ts":"2026-11-09T02:48:16.793Z"}
-{"type":"step_finished","task":"modernize","item":"runner-compat-shim-removal","step":"review","attempt":1,"status":"ok","sessionId":"01a1be34-da1d-728c-937c-aaabfe828414","usage":{"inputTokens":39760,"outputTokens":11838,"costUsd":0.006626},"ts":"2026-11-09T02:50:21.192Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-stream-helper","step":"develop","attempt":1,"status":"ok","sessionId":"01a1be34-da4c-77e4-bdd9-60c0b69ac366","usage":{"inputTokens":70727,"outputTokens":13200,"costUsd":0.023488},"ts":"2026-11-09T03:02:05.601Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":1,"sizeBytes":12079788,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-48-17-173Z_01a1be34-da15-73f2-a993-2cf5f64627dd","ts":"2026-11-09T03:10:06.149Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":1,"toolCalls":142,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T02-48-17-173Z_01a1be34-da15-73f2-a993-2cf5f64627dd","ts":"2026-11-09T03:10:06.150Z"}
-{"type":"step_finished","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1be34-da15-73f2-a993-2cf5f64627dd","usage":{"inputTokens":159729,"outputTokens":62311,"costUsd":0.087402},"ts":"2026-11-09T03:13:19.644Z"}
-{"type":"step_started","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-stream-helper/.factory/tasks/modernize/items/checkers-stream-helper/steps/004-qa-r2-a1","ts":"2026-11-09T03:13:24.521Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-stream-helper","step":"qa","timeoutSec":5400,"ts":"2026-11-09T03:13:24.566Z"}
-{"type":"step_started","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":2,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2","ts":"2026-11-09T03:13:24.579Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"decision-backend-impl","step":"develop","timeoutSec":5400,"ts":"2026-11-09T03:13:24.593Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":2,"sizeBytes":19163780,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-13-25-041Z_01a1be4b-dc31-77c5-9306-76452252bdc5","ts":"2026-11-09T03:42:36.700Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":2,"toolCalls":144,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-13-25-041Z_01a1be4b-dc31-77c5-9306-76452252bdc5","ts":"2026-11-09T03:42:36.700Z"}
-{"type":"step_transcript_size_warning","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"sizeBytes":16439214,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-13-25-051Z_01a1be4b-dc3b-75f8-ab95-c0510acd33a2","ts":"2026-11-09T03:42:38.910Z"}
-{"type":"step_tool_call_warning","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"toolCalls":174,"threshold":60,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T03-13-25-051Z_01a1be4b-dc3b-75f8-ab95-c0510acd33a2","ts":"2026-11-09T03:42:38.911Z"}
-{"type":"step_finished","task":"modernize","item":"checkers-stream-helper","step":"qa","attempt":1,"status":"ok","sessionId":"01a1be4b-dc3b-75f8-ab95-c0510acd33a2","usage":{"inputTokens":286889,"outputTokens":106196,"costUsd":0.064488},"ts":"2026-11-09T03:42:38.996Z"}
-{"type":"step_finished","task":"modernize","item":"decision-backend-impl","step":"develop","attempt":2,"status":"rejected","sessionId":"01a1be4b-dc31-77c5-9306-76452252bdc5","usage":{"inputTokens":209913,"outputTokens":106336,"costUsd":0.129098},"ts":"2026-11-09T03:45:50.391Z"}
-{"type":"step_started","task":"modernize","step":"consult-decision-backend-impl","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1","ts":"2026-11-09T03:45:54.386Z"}
-{"type":"step_timeout_armed","task":"modernize","step":"consult-decision-backend-impl","timeoutSec":7200,"ts":"2026-11-09T03:45:54.390Z"}
-{"type":"step_started","task":"modernize","item":"checkers-stream-helper","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/python-setup.factory-wt/topic_modernize--checkers-stream-helper/.factory/tasks/modernize/items/checkers-stream-helper/steps/005-review-r2-a1","ts":"2026-11-09T03:45:54.439Z"}
-{"type":"step_timeout_armed","task":"modernize","item":"checkers-stream-helper","step":"review","timeoutSec":3600,"ts":"2026-11-09T03:45:54.443Z"}
-{"type":"step_transcript_size_warning","task":"modernize","step":"consult-decision-backend-impl","attempt":1,"sizeBytes":13850598,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl","ts":"2026-11-09T03:48:01.762Z"}
diff --git a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/input.md b/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/input.md
deleted file mode 100644
index cbac8fb..0000000
--- a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/input.md
+++ /dev/null
@@ -1,900 +0,0 @@
-# Step: Architect Consult (Item)
-
-## Goal
-Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.
-
-## Rules
-- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize`
-
-Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.
-
----
-
-## 1. Snapshot and Gate State
-
-| Fact | Evidence |
-|---|---|
-| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
-| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
-| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
-| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
-| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
-| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
-| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
-| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
-| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
-| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
-| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |
-
-**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).
-
----
-
-## 2. Module Map
-
-### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)
-
-| File(s) | Responsibility |
-|---|---|
-| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
-| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
-| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
-| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |
-
-### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)
-
-| File(s) | Responsibility |
-|---|---|
-| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
-| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
-| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
-| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
-| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
-| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
-| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
-| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |
-
-### 2.3 Setup / testing / packaging
-
-| File(s) | Responsibility |
-|---|---|
-| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
-| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
-| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
-| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
-| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
-| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |
-
-### 2.4 Tests (`tests/`)
-
-59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).
-
----
-
-## 3. Key Interfaces & Signatures
-
-### 3.1 Justification decision entry point — `check_if_meaningful`
-
-`src/python_setup_lint/checkers/_base.py:142-238`:
-
-```python
-@beartype
-def check_if_meaningful(
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-) -> bool:
-```
-
-Flow:
-
-1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
-2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).
-
-`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.
-
-Call sites (all five pass a real rule/context):
-
-- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
-- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
-- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).
-
-### 3.2 Semantic implementation — `semantic_check_if_meaningful`
-
-`src/python_setup_lint/checkers/_semantic.py:125-189`:
-
-```python
-@beartype
-def semantic_check_if_meaningful(
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-) -> bool | None:
-```
-
-| Detail | Evidence |
-|---|---|
-| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
-| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
-| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
-| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
-| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
-| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
-| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |
-
-### 3.3 Cache and model constants (current, to be replaced)
-
-`_semantic.py:37-52`:
-
-```python
-_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
-_RERANKER_INSTANCE: CrossEncoder | None = None
-_RERANKER_UNAVAILABLE: bool = False
-_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
-_RESULT_CACHE: dict[int, bool] | None = None
-_RERANKER_MODEL = os.environ.get(
-    "PYTHON_SETUP_LINT_RERANKER_MODEL",
-    "jina-reranker-v2-base-multilingual",
-)
-```
-
-Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.
-
-### 3.4 Planned backend contract from ADR-010 (absent at HEAD)
-
-`docs/adr/ADR-010.md:23-36` fixes:
-
-- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
-- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
-- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
-- Prune missing files and stale model identifiers.
-- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
-- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.
-
-No implementation module exists at HEAD; `_semantic.py` remains the only decision path.
-
-### 3.5 Runner interfaces relevant to a cache-refresh command
-
-- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
-- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
-- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
-- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.
-
-### 3.6 Checker helper / test harness interfaces
-
-- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
-- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
-- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
-- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).
-
----
-
-## 4. Relevant Excerpts and Implementation Logic
-
-### 4.1 Current semantic pipeline is reranker-first, not heuristic-first
-
-`_semantic.py:1-12`:
-
-```python
-# Semantic justification checker using a cross-encoder reranker (Track B).
-# ...
-# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
-#    Re-score the justification against the rule and code context with a
-#    dedicated cross-encoder for higher accuracy.
-# ...
-# On ImportError ... or model download failure, semantic_check_if_meaningful
-# returns None, signalling the caller to fall back to the heuristic check.
-```
-
-This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.
-
-### 4.2 `semantic_check_if_meaningful` scoring and write path
-
-`_semantic.py:142-189` (condensed):
-
-```python
-cache_key = hashlib.sha256(
-    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
-).digest()
-cache_key_int = int.from_bytes(cache_key[:8], "big")
-if cache_key_int in _RESULT_CACHE:
-    return _RESULT_CACHE[cache_key_int]
-
-reranker = _load_reranker()
-if reranker is None:
-    return None
-...
-scores = reranker.predict([(primary, query)])
-result = float(scores[0]) >= 0.5
-_RESULT_CACHE[cache_key_int] = result
-_save_result_cache()
-return result
-```
-
-Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.
-
-### 4.3 W9704 emission and the two decision call paths
-
-`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:
-
-```python
-if check_if_meaningful(
-    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
-):
-    return
-self.add_message("unjustified-suppression", ...)
-```
-
-`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).
-
-### 4.4 Cache writer verdict that any redesign must consume
-
-`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:
-
-- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
-- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
-- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
-- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
-- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
-- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.
-
-The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).
-
-### 4.5 ADR-010 conflicts with the current tests
-
-`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.
-
-### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)
-
-`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:
-
-- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
-- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).
-
-So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.
-
-### 4.7 Existing sorted-JSON/atomic-write patterns
-
-- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
-- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
-- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
-- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.
-
----
-
-## 5. Existing Tests and Conventions
-
-### 5.1 Test layers and commands
-
-| Layer | Command | Scope / evidence |
-|---|---|---|
-| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
-| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
-| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
-| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
-| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |
-
-### 5.2 Checker test conventions
-
-- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
-- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
-- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
-- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
-- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
-- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.
-
-### 5.3 Golden behavior-preservation contract
-
-`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).
-
-Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).
-
-### 5.4 Semantic test inventory and redundancy
-
-| File | Lines / roles | Redundancy / impact |
-|---|---|---|
-| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
-| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
-| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
-| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |
-
-### 5.5 Existing debloat evidence (objective)
-
-| Category | Evidence |
-|---|---|
-| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
-| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
-| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
-| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
-| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
-| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
-| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
-| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
-| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
-| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
-| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |
-
-### 5.6 Third-party assumptions to read before debloating
-
-- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
-- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
-- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
-- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.
-
----
-
-## 6. Model Candidate Landscape (external; verify before adoption)
-
-The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.
-
-| Candidate | Params | License | Runtime / CPU evidence | Notes |
-|---|---:|---|---|---|
-| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
-| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
-| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
-| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
-| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
-| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
-| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |
-
-Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.
-
-Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).
-
----
-
-## 7. Open Questions and Uncertainties
-
-1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?
-
-2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.
-
-3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).
-
-4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.
-
-5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.
-
-6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).
-
-7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?
-
-8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?
-
-9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.
-
-10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).
-
-11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.
-
-12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.
-
-13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.
-
-14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.
-
----
-
-## 8. Recommendations for the Architect
-
-1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.
-
-2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.
-
-3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.
-
-4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.
-
-5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.
-
-6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.
-
-7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
-- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
-  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
-  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
-  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
-  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
-  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
-- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.
-
-## Item
-decision-backend-impl
-
-## Assignment
-{"slug":"decision-backend-impl","kind":"dev","title":"Implement veto DecisionBackend with FakeBackend","assignment":"Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.","outlineRef":"decision-backend-impl","milestone":"M4","wave":2,"deps":["decision-cache-design-spike","semantic-threshold-consolidation"],"scenarioRefs":["M4: Veto backend without model"],"citations":["src/python_setup_lint/checkers/_semantic.py:1-12","src/python_setup_lint/checkers/_semantic.py:93-122","src/python_setup_lint/checkers/_semantic.py:125-189","src/python_setup_lint/checkers/_base.py:142-158","pyproject.toml:28-31","AGENTS.md:79-85"],"escalate":true}
-
-## Prior Attempts & Failures
-2 attempts recorded for develop (all rejected); next would be 3 > max 2
-
-Failing checks:
-[gates] Gate regressions: test-integration
-
-## Current Diff
-.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/checks.yaml +77/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/input.md +72/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/meta.yaml +19/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/output.yaml +89/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/checks.yaml +87/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/input.md +79/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/meta.yaml +19/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/output.yaml +103/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/checks.yaml +363/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/input.md +114/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/meta.yaml +19/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml +124/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/checks.yaml +363/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/input.md +140/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/meta.yaml +19/-0
-.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/output.yaml +113/-0
-pyproject.toml +2/-3
-src/python_setup_lint/checkers/_base.py +27/-13
-src/python_setup_lint/checkers/_base.pyi +9/-6
-src/python_setup_lint/checkers/_decision_backend.py +59/-0
-src/python_setup_lint/checkers/_decision_backend.pyi +16/-0
-src/python_setup_lint/checkers/_semantic.py +14/-138
-src/python_setup_lint/checkers/_semantic.pyi +6/-8
-src/python_setup_lint/checkers/conformance/no_try_import_checker.py +2/-1
-tests/assumptions/test_pylint_cache_semantics.py +128/-258
-tests/checkers/test_decision_backend.py +320/-0
-tests/checkers/test_no_try_import_checker.py +17/-0
-tests/checkers/test_semantic_check.py +102/-370
-tests/checkers/test_suppression_justification_checker.py +23/-31
-uv.lock +0/-709
-
-## Review Feedback
-Failing check: gates
-
-Message: Gate regressions: test-integration
-
-Detail:
-olden_path}\")\n            warnings.warn(f\"updating golden files for {golden_path}\", stacklevel=2)\n            write_golden_files(golden_path, findings)\n            return\n        committed = read_golden(golden_path)\n        added, removed = _diff_keys(findings, committed)\n        if added or removed:\n>           pytest.fail(_format_drift(added, removed, golden_path))\nE           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nE           added (3):\nE             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n\ntests/_golden.py:389: Failed\n========================= Tach Impact Analysis Warning =========================\n[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!\n[Tach] These failures would be missed when using --tach:\n[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint\n=========================== short test summary info ============================\nFAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nadded (3):\n  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n1 failed, 8 passed in 48.82s\n[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]",
-    "failingTests": [
-      "tests.integration.TestMinimalSampleProject.test_setup_new_and_lint"
-    ]
-  }
-]
-
-Output tail:
-get("GITHUB_ACTIONS"):
-                pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
-            warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
-            write_golden_files(golden_path, findings)
-            return
-        committed = read_golden(golden_path)
-        added, removed = _diff_keys(findings, committed)
-        if added or removed:
->           pytest.fail(_format_drift(added, removed, golden_path))
-E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
-E           added (3):
-E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-
-tests/_golden.py:389: Failed
-========================= Tach Impact Analysis Warning =========================
-[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
-[Tach] These failures would be missed when using --tach:
-[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
-=========================== short test summary info ============================
-FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
-added (3):
-  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
-1 failed, 8 passed in 48.82s
-[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]
-
-## Context Pack
-# Context Pack — `modernize`
-
-Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.
-
----
-
-## 1. Snapshot and Gate State
-
-| Fact | Evidence |
-|---|---|
-| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
-| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
-| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
-| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
-| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
-| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
-| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
-| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
-| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
-| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
-| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |
-
-**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).
-
----
-
-## 2. Module Map
-
-### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)
-
-| File(s) | Responsibility |
-|---|---|
-| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
-| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
-| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
-| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |
-
-### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)
-
-| File(s) | Responsibility |
-|---|---|
-| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
-| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
-| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
-| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
-| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
-| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
-| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
-| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |
-
-### 2.3 Setup / testing / packaging
-
-| File(s) | Responsibility |
-|---|---|
-| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
-| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
-| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
-| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
-| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
-| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |
-
-### 2.4 Tests (`tests/`)
-
-59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).
-
----
-
-## 3. Key Interfaces & Signatures
-
-### 3.1 Justification decision entry point — `check_if_meaningful`
-
-`src/python_setup_lint/checkers/_base.py:142-238`:
-
-```python
-@beartype
-def check_if_meaningful(
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-) -> bool:
-```
-
-Flow:
-
-1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
-2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).
-
-`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.
-
-Call sites (all five pass a real rule/context):
-
-- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
-- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
-- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).
-
-### 3.2 Semantic implementation — `semantic_check_if_meaningful`
-
-`src/python_setup_lint/checkers/_semantic.py:125-189`:
-
-```python
-@beartype
-def semantic_check_if_meaningful(
-    text: str,
-    *,
-    rule: str | None = None,
-    code_context: str | None = None,
-    comment: str | None = None,
-) -> bool | None:
-```
-
-| Detail | Evidence |
-|---|---|
-| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
-| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
-| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
-| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
-| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
-| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
-| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |
-
-### 3.3 Cache and model constants (current, to be replaced)
-
-`_semantic.py:37-52`:
-
-```python
-_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
-_RERANKER_INSTANCE: CrossEncoder | None = None
-_RERANKER_UNAVAILABLE: bool = False
-_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
-_RESULT_CACHE: dict[int, bool] | None = None
-_RERANKER_MODEL = os.environ.get(
-    "PYTHON_SETUP_LINT_RERANKER_MODEL",
-    "jina-reranker-v2-base-multilingual",
-)
-```
-
-Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.
-
-### 3.4 Planned backend contract from ADR-010 (absent at HEAD)
-
-`docs/adr/ADR-010.md:23-36` fixes:
-
-- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
-- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
-- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
-- Prune missing files and stale model identifiers.
-- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
-- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.
-
-No implementation module exists at HEAD; `_semantic.py` remains the only decision path.
-
-### 3.5 Runner interfaces relevant to a cache-refresh command
-
-- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
-- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
-- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
-- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.
-
-### 3.6 Checker helper / test harness interfaces
-
-- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
-- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
-- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
-- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).
-
----
-
-## 4. Relevant Excerpts and Implementation Logic
-
-### 4.1 Current semantic pipeline is reranker-first, not heuristic-first
-
-`_semantic.py:1-12`:
-
-```python
-# Semantic justification checker using a cross-encoder reranker (Track B).
-# ...
-# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
-#    Re-score the justification against the rule and code context with a
-#    dedicated cross-encoder for higher accuracy.
-# ...
-# On ImportError ... or model download failure, semantic_check_if_meaningful
-# returns None, signalling the caller to fall back to the heuristic check.
-```
-
-This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.
-
-### 4.2 `semantic_check_if_meaningful` scoring and write path
-
-`_semantic.py:142-189` (condensed):
-
-```python
-cache_key = hashlib.sha256(
-    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
-).digest()
-cache_key_int = int.from_bytes(cache_key[:8], "big")
-if cache_key_int in _RESULT_CACHE:
-    return _RESULT_CACHE[cache_key_int]
-
-reranker = _load_reranker()
-if reranker is None:
-    return None
-...
-scores = reranker.predict([(primary, query)])
-result = float(scores[0]) >= 0.5
-_RESULT_CACHE[cache_key_int] = result
-_save_result_cache()
-return result
-```
-
-Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.
-
-### 4.3 W9704 emission and the two decision call paths
-
-`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:
-
-```python
-if check_if_meaningful(
-    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
-):
-    return
-self.add_message("unjustified-suppression", ...)
-```
-
-`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).
-
-### 4.4 Cache writer verdict that any redesign must consume
-
-`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:
-
-- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
-- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
-- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
-- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
-- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
-- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.
-
-The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).
-
-### 4.5 ADR-010 conflicts with the current tests
-
-`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.
-
-### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)
-
-`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:
-
-- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
-- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).
-
-So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.
-
-### 4.7 Existing sorted-JSON/atomic-write patterns
-
-- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
-- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
-- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
-- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.
-
----
-
-## 5. Existing Tests and Conventions
-
-### 5.1 Test layers and commands
-
-| Layer | Command | Scope / evidence |
-|---|---|---|
-| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
-| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
-| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
-| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
-| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |
-
-### 5.2 Checker test conventions
-
-- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
-- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
-- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
-- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
-- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
-- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.
-
-### 5.3 Golden behavior-preservation contract
-
-`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).
-
-Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).
-
-### 5.4 Semantic test inventory and redundancy
-
-| File | Lines / roles | Redundancy / impact |
-|---|---|---|
-| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
-| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
-| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
-| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |
-
-### 5.5 Existing debloat evidence (objective)
-
-| Category | Evidence |
-|---|---|
-| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
-| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
-| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
-| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
-| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
-| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
-| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
-| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
-| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
-| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
-| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |
-
-### 5.6 Third-party assumptions to read before debloating
-
-- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
-- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
-- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
-- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.
-
----
-
-## 6. Model Candidate Landscape (external; verify before adoption)
-
-The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.
-
-| Candidate | Params | License | Runtime / CPU evidence | Notes |
-|---|---:|---|---|---|
-| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
-| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
-| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
-| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
-| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
-| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
-| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |
-
-Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.
-
-Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).
-
----
-
-## 7. Open Questions and Uncertainties
-
-1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?
-
-2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.
-
-3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).
-
-4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.
-
-5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.
-
-6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).
-
-7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?
-
-8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?
-
-9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.
-
-10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).
-
-11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.
-
-12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.
-
-13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.
-
-14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.
-
----
-
-## 8. Recommendations for the Architect
-
-1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.
-
-2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.
-
-3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.
-
-4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.
-
-5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.
-
-6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.
-
-7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.
-
-## Output
-
-Yield a structured JSON object matching this schema:
-- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
-- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
-- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
-- rationale (string, optional): Technical justification for this decision
-- text (string, optional): Concrete guidance or steering directives
-- persist (boolean, optional): Whether guidance persists across subsequent attempts
-- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
-- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
-- outline (object, optional): Item outline to schedule when decision is fix-item
-- debt (string, optional): Technical debt description when decision is accept-with-debt
-- reason (string, optional): Reason for abandonment or abort
-- question (string, optional): Specific question for human operator when decision is human-async or blocked
-- planDelta (string, optional): Plan delta or amendment directives when decision is amend
-- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
diff --git a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/meta.yaml b/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/meta.yaml
deleted file mode 100644
index 8c5c8c1..0000000
--- a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/meta.yaml
+++ /dev/null
@@ -1,17 +0,0 @@
-seq: 98
-name: consult-decision-backend-impl
-attempt: 1
-agent: architect
-role: architect
-models:
-  - opencode-go/muse-spark-1.3-contributor
-session: 01a1b8a3-f9ce-7511-963e-37a3531a2d3a
-timeoutSec: 7200
-status: ok
-startedAt: 2026-11-09T03:45:54.315Z
-endedAt: 2026-11-09T03:48:01.773Z
-usage:
-  inputTokens: 167130
-  outputTokens: 13624
-  costUsd: 0.021683
-traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T00-51-56-494Z_01a1b8a3-f9ce-7511-963e-37a3531a2d3a.jsonl
diff --git a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/output.yaml b/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/output.yaml
deleted file mode 100644
index cdb01cc..0000000
--- a/.factory/tasks/modernize/runs/098-consult-decision-backend-impl-a1/output.yaml
+++ /dev/null
@@ -1,35 +0,0 @@
-context: item
-decision: retry-with-guidance
-persist: true
-rationale: "SEMANTIC=0 heuristic regression, not an intended shift. Golden
-  capture runs with PYTHON_SETUP_LINT_SEMANTIC=0 (tests/integration.py:112), so
-  ADR-014 requires byte-identical heuristic behavior: veto applies only when
-  SEMANTIC=1 with a live backend, and any-element echo is a no-op for
-  single-code rules. New finding at mod.py:42 (preceding-line reason 'pylint:
-  disable=some-rule' now rejected) proves the heuristic was tightened beyond the
-  joiner/sort/match allowance. Fix is bounded: restore exact heuristic under
-  SEMANTIC=0."
-text: "Fix in this order (zero tests/data writes; golden-regen-hatch is sole
-  golden writer; no shift report — this is a no-shift bug): (1) Preserve
-  SEMANTIC=0 exactly: keep
-  `os.environ.get('PYTHON_SETUP_LINT_SEMANTIC','1')=='1'` guard; when '0', skip
-  semantic/backend entirely and return the heuristic bool directly. (2) Restore
-  heuristic byte-identical to _base.py:160-238: primary=(comment or
-  text).strip(); empty/<5 False; exact `primary_lower in boilerplate` (50-entry,
-  no word-split/substring); exact `primary_lower in meaningless_phrases` (no
-  substring); rule-echo only as `primary_lower == any(element_lower)` over
-  normalize_suppressed_codes(rule).split(',') — no suppression-pattern
-  rejection, no extra boilerplate. Nachweis: check_if_meaningful('pylint:
-  disable=some-rule', rule='unjustified-suppression', code_context='def
-  _bare_suppression() -> None:', comment=same) with SEMANTIC=0 must be True
-  (preceding-suppression quirk from
-  suppression_justification_checker.py:377-386; checker-level fix belongs to
-  checkers-legacy, not backend). (3) None mapping: semantic_check returns None
-  (not False) when loader/backend None; veto heuristic AND (prob>=0.5) only when
-  backend returns float. (4) Revert any test asserts of the buggy False for
-  line-42-style reasons; keep test_decision_backend.py but pin SEMANTIC=0
-  preservation. Minimize tests/assumptions + test_semantic_check churn (full
-  rewrite is semantic-tests-rewrite via dep). (5) Verify: `uv run pytest
-  tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint -q`
-  golden hash-equal (line 41 only, no line 42); `uv run pytest -q` no new
-  failures vs M1 table; uv.lock still resolves."
diff --git a/.factory/tasks/modernize/state.yaml b/.factory/tasks/modernize/state.yaml
index 88f21fb..f3c6493 100644
--- a/.factory/tasks/modernize/state.yaml
+++ b/.factory/tasks/modernize/state.yaml
@@ -15,22 +15,20 @@ items:
     mergedAt: 2026-11-08T17:38:59-05:00
   baseline-diff-merge:
     kind: test-only
-    status: merged
+    status: ready
     branch: topic/modernize--baseline-diff-merge
     attempts: 1
     fixRounds: 2
     spendUsd: 0.11384300000000001
     currentStep: review
-    mergedAt: 2026-11-08T20:41:25-05:00
   checkers-semantic-guards:
     kind: test-only
-    status: merged
+    status: ready
     branch: topic/modernize--checkers-semantic-guards
     attempts: 1
     fixRounds: 1
     spendUsd: 0.032317
     currentStep: review
-    mergedAt: 2026-11-08T20:47:46-05:00
   consolidate-integration-helpers-i2:
     kind: test-only
     status: merged
@@ -42,13 +40,12 @@ items:
     mergedAt: 2026-11-08T07:59:15-05:00
   decision-cache-design-spike:
     kind: poc
-    status: merged
+    status: ready
     branch: topic/modernize--decision-cache-design-spike
     attempts: 1
     fixRounds: 1
     spendUsd: 0.211512
     currentStep: review
-    mergedAt: 2026-11-08T20:44:48-05:00
   golden-determinism-probe:
     kind: fact-finder
     status: merged
@@ -112,13 +109,12 @@ items:
     mergedAt: 2026-11-08T17:32:58-05:00
   semantic-threshold-consolidation:
     kind: test-only
-    status: merged
+    status: ready
     branch: topic/modernize--semantic-threshold-consolidation
     attempts: 1
     fixRounds: 1
     spendUsd: 0.032682
     currentStep: review
-    mergedAt: 2026-11-08T20:41:29-05:00
   third-party-assumption-tests:
     kind: test-assumptions
     status: merged
@@ -139,28 +135,25 @@ items:
     mergedAt: 2026-11-08T09:50:28-05:00
   checkers-factories-split:
     kind: test-only
-    status: ready
+    status: pending
     branch: topic/modernize--checkers-factories-split
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.09088800000000001
-    currentStep: review
+    spendUsd: 0
   checkers-stream-helper:
     kind: no-behavior
-    status: running
+    status: pending
     branch: topic/modernize--checkers-stream-helper
     attempts: 1
-    fixRounds: 2
-    spendUsd: 0.18664000000000003
-    currentStep: qa
+    fixRounds: 1
+    spendUsd: 0
   decision-backend-impl:
     kind: dev
-    status: running
+    status: pending
     branch: topic/modernize--decision-backend-impl
-    attempts: 2
+    attempts: 1
     fixRounds: 1
-    spendUsd: 0.405485
-    currentStep: develop
+    spendUsd: 0
   epic-kickoff-gate:
     kind: fact-finder
     status: pending
@@ -196,12 +189,11 @@ items:
     mergedAt: 2026-11-08T10:03:05-05:00
   runner-compat-shim-removal:
     kind: no-behavior
-    status: ready
+    status: pending
     branch: topic/modernize--runner-compat-shim-removal
     attempts: 1
     fixRounds: 1
-    spendUsd: 0.056304
-    currentStep: review
+    spendUsd: 0
   secrets-triage-spike:
     kind: fact-finder
     status: ready
@@ -554,8 +546,6 @@ debt:
     fixture-scoped clearing"
   - "[third-party-assumption-tests] Assert confidence is not None before reading
     .name"
-  - "[checkers-factories-split] _factories_stub.py at 474/500 lines leaves 26
-    lines of C0302 headroom"
   - "[golden-contract-hardening] Add runs guard and messages to byte-identical
     hash asserts"
   - "[golden-contract-hardening] Consider SHA-256 comparison for counts payloads
@@ -635,20 +625,20 @@ debt:
     obscure"
   - '[consolidate-integration-helpers-v3] make_consumer_project hardcodes
     "consumer" dirname for hooks test'
-budgetSpentUsd: 9.801449685999998
+budgetSpentUsd: 8.972082685999995
 spendByRole:
   workhorse:
-    costUsd: 4.531155685999999
-    inputTokens: 8728965
-    outputTokens: 3289815
+    costUsd: 3.915029686
+    inputTokens: 7635653
+    outputTokens: 2842296
   alt-workhorse:
-    costUsd: 1.0925280000000004
-    inputTokens: 5118111
-    outputTokens: 1889714
+    costUsd: 0.9675500000000007
+    inputTokens: 4521588
+    outputTokens: 1673254
   architect:
-    costUsd: 4.079484000000001
-    inputTokens: 11205244
-    outputTokens: 424987
+    costUsd: 3.9912210000000004
+    inputTokens: 10327036
+    outputTokens: 422778
   alt-architect:
     costUsd: 0.098282
     inputTokens: 360499
@@ -666,10 +656,6 @@ spendByItem:
     costUsd: 0.170578
     inputTokens: 226110
     outputTokens: 148096
-  decision-cache-design-spike:
-    costUsd: 0.211512
-    inputTokens: 419522
-    outputTokens: 197490
   test-debloat-audit-i2:
     costUsd: 0.258385
     inputTokens: 707051
@@ -678,10 +664,6 @@ spendByItem:
     costUsd: 0.016725999999999998
     inputTokens: 57664
     outputTokens: 27228
-  semantic-threshold-consolidation:
-    costUsd: 0.032682
-    inputTokens: 87033
-    outputTokens: 43025
   coding-rules-audit-i2:
     costUsd: 0.133783
     inputTokens: 266809
@@ -710,10 +692,6 @@ spendByItem:
     costUsd: 0.045265
     inputTokens: 116110
     outputTokens: 59317
-  checkers-semantic-guards:
-    costUsd: 0.032317
-    inputTokens: 74694
-    outputTokens: 40738
   secrets-baseline-exclusion:
     costUsd: 0.041534
     inputTokens: 120849
@@ -738,38 +716,34 @@ spendByItem:
     costUsd: 0.091885
     inputTokens: 206331
     outputTokens: 89105
-  runner-compat-shim-removal:
-    costUsd: 0.056304
-    inputTokens: 156193
-    outputTokens: 75024
   golden-snapshot-wiring:
     costUsd: 0.13088
     inputTokens: 218824
     outputTokens: 95126
-  checkers-stream-helper:
-    costUsd: 0.18664000000000003
-    inputTokens: 589111
-    outputTokens: 219258
   consolidate-integration-helpers-v3:
     costUsd: 0.19283999999999998
     inputTokens: 341355
     outputTokens: 174695
+  checkers-semantic-guards:
+    costUsd: 0.032317
+    inputTokens: 74694
+    outputTokens: 40738
   secrets-triage-spike:
     costUsd: 0.076996
     inputTokens: 208236
     outputTokens: 84395
-  decision-backend-impl:
-    costUsd: 0.405485
-    inputTokens: 661131
-    outputTokens: 295838
+  semantic-threshold-consolidation:
+    costUsd: 0.032682
+    inputTokens: 87033
+    outputTokens: 43025
   consolidate-integration-helpers-v2:
     costUsd: 0.19363600000000003
     inputTokens: 413243
     outputTokens: 140910
-  checkers-factories-split:
-    costUsd: 0.09088800000000001
-    inputTokens: 274090
-    outputTokens: 70148
+  decision-cache-design-spike:
+    costUsd: 0.211512
+    inputTokens: 419522
+    outputTokens: 197490
   pylint-cache-assumptions:
     costUsd: 0.210224686
     inputTokens: 334753
@@ -779,7 +753,7 @@ spendByItem:
     inputTokens: 1215172
     outputTokens: 444746
   (orchestration):
-    costUsd: 4.94665
-    inputTokens: 13644622
-    outputTokens: 1442515
-lastUpdated: 2026-11-09T03:45:54.072Z
+    costUsd: 4.856599999999999
+    inputTokens: 12757104
+    outputTokens: 1436595
+lastUpdated: 2026-11-09T01:41:29.191Z
diff --git a/pyproject.toml b/pyproject.toml
index 858424a..c0a8ca6 100644
--- a/pyproject.toml
+++ b/pyproject.toml
@@ -26,9 +26,8 @@ python-setup-test-checked = "python_setup_lint.testing:test_checked_main"
 python-setup = "python_setup_lint.setup:main"
 
 [project.optional-dependencies]
-semantic = [
-    "sentence-transformers>=3.0.0",
-]
+# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
+semantic = []
 
 [build-system]
 requires = [
diff --git a/src/python_setup_lint/checkers/_base.py b/src/python_setup_lint/checkers/_base.py
index f004538..0d8ac7e 100644
--- a/src/python_setup_lint/checkers/_base.py
+++ b/src/python_setup_lint/checkers/_base.py
@@ -3,6 +3,7 @@ from __future__ import annotations
 import fnmatch
 import logging
 import os
+import re
 from pathlib import Path
 from typing import TYPE_CHECKING, NamedTuple
 
@@ -11,6 +12,8 @@ from astroid import nodes  # astroid is a pylint dependency, only used for type
 from beartype import beartype
 from pylint.typing import MessageDefinitionTuple
 
+from python_setup_lint.checkers._decision_backend import DecisionBackend
+
 # Configure structlog at import time to suppress debug/info noise from all checkers.
 # This runs when pylint loads the first checker plugin (pylint subprocess).
 # The wrapper_class filters at the bound-logger level, before events reach
@@ -139,6 +142,20 @@ class FunctionVisitMixin(SourceRootMixin):
         self._check_function(node)  # type: ignore[reportAttributeAccessIssue]  # mixin: _check_function defined in subclass
 
 
+_DIRECTIVE_PREFIX = re.compile(r"^\s*(?:(?:type|ty)\s*:\s*ignore|noqa|pylint\s*:\s*disable)\b")
+
+
+@beartype
+def normalize_suppressed_codes(raw: str) -> str:
+    match = _DIRECTIVE_PREFIX.match(raw)
+    if match is None:
+        return raw.strip()
+    codes, _, reason = raw[match.end() :].partition("#")
+    tokens = {token.lower() for token in re.split(r"[\s,]+", codes.strip(" []:=")) if token}
+    reason_tokens = {token.lower() for token in re.split(r"[\s,]+", reason) if token}
+    return raw.strip() if not reason_tokens else "" if reason_tokens <= tokens else reason.strip()
+
+
 @beartype
 def check_if_meaningful(
     text: str,
@@ -146,19 +163,9 @@ def check_if_meaningful(
     rule: str | None = None,
     code_context: str | None = None,
     comment: str | None = None,
+    backend: DecisionBackend | None = None,
 ) -> bool:
-    # Try the semantic NLP pipeline when enabled.
-    if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1":
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful as _semantic_check,
-        )
-
-        result = _semantic_check(text, rule=rule, code_context=code_context, comment=comment)
-        if result is not None:
-            return result
-
-    # Heuristic fallback.
-    primary = (comment or text).strip()
+    primary = normalize_suppressed_codes(comment or text).strip()
     if not primary or len(primary) < 5:
         return False
     primary_lower = primary.lower()
@@ -235,4 +242,11 @@ def check_if_meaningful(
     if primary_lower in meaningless_phrases:
         return False
     # Reject justification that is just the rule symbol itself.
-    return not (rule and primary_lower == rule.lower())
+    if rule and primary_lower in {code.strip().lower() for code in normalize_suppressed_codes(rule).split(",")}:
+        return False
+
+    if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
+        return True
+    from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
+
+    return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
diff --git a/src/python_setup_lint/checkers/_base.pyi b/src/python_setup_lint/checkers/_base.pyi
index f3b40b5..b76093c 100644
--- a/src/python_setup_lint/checkers/_base.pyi
+++ b/src/python_setup_lint/checkers/_base.pyi
@@ -13,6 +13,8 @@ from astroid import nodes
 from pylint.lint import PyLinter
 from pylint.typing import MessageDefinitionTuple
 
+from python_setup_lint.checkers._decision_backend import DecisionBackend
+
 def _msgs(**definitions: MessageDef) -> dict[str, MessageDefinitionTuple]:
     """Build a checker msgs dict with domain-typed keys."""
 
@@ -66,30 +68,31 @@ class FunctionVisitMixin(SourceRootMixin):
     def visit_functiondef(self, node: nodes.FunctionDef) -> None: ...
     def visit_asyncfunctiondef(self, node: nodes.AsyncFunctionDef) -> None: ...
 
+def normalize_suppressed_codes(raw: str) -> str:  # pylint: disable=generic-return-requires-returns  # the one-line doc states the return
+    """Return the technical reason; raw comment when none is given, ``""`` when it echoes codes."""
+
 def check_if_meaningful(
     text: str,
     *,
     rule: str | None = None,
     code_context: str | None = None,
     comment: str | None = None,
+    backend: DecisionBackend | None = None,
 ) -> bool:
     """Check if a suppression justification is meaningful.
 
-    Uses the NLP semantic pipeline (``_semantic.semantic_check_if_meaningful``)
-    when enabled and available, falling back to a heuristic check.
-
-    The semantic pipeline is enabled by default (``PYTHON_SETUP_LINT_SEMANTIC=1``)
-    and requires the ``[semantic]`` extra (``sentence-transformers``).
+    The heuristic gate runs first; a backend may only veto, never resurrect.
 
     Heuristic: non-empty, non-boilerplate, not equal to the rule symbol.
     Uses *comment* as the primary text if provided; falls back to *text*.
-    *rule* and *code_context* are reserved for future semantic analysis.
+    *rule* and *code_context* are the backend query when one is configured.
 
     Args:
         text: The raw justification text.
         rule: The lint rule identifier being suppressed.
         code_context: Surrounding source code lines.
         comment: The justification comment text (preferred over *text*).
+        backend: A decision backend; ``None`` resolves the registered backend.
 
     Returns:
         True if the justification is meaningful, False otherwise.
diff --git a/src/python_setup_lint/checkers/_decision_backend.py b/src/python_setup_lint/checkers/_decision_backend.py
new file mode 100644
index 0000000..9c37de3
--- /dev/null
+++ b/src/python_setup_lint/checkers/_decision_backend.py
@@ -0,0 +1,59 @@
+from __future__ import annotations
+
+import importlib
+import os
+from typing import Protocol, runtime_checkable
+
+import structlog
+from beartype import beartype
+
+DECISION_THRESHOLD: float = 0.5
+PROMPT_VERSION: str = "prompt-v1"
+_LOG = structlog.get_logger(__name__)
+_WARNED: set[str] = set()
+
+
+@runtime_checkable
+class DecisionBackend(Protocol):
+    model_id: str
+
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...  # pylint: disable=missing-beartype  # protocol method: never runtime-checked
+
+
+class FakeBackend:
+    model_id: str = "fake-backend rev test prompt-v1"
+
+    def __init__(self, score: float = 1.0) -> None:
+        self.score = score
+
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float:  # pylint: disable=missing-beartype  # noqa: ARG002  # fake ignores its inputs
+        return self.score
+
+
+def _reset_backend_state() -> None:  # pylint: disable=trivial-wrapper  # test seam resets warn-once state
+    _WARNED.clear()
+
+
+def _load_registered_backend() -> DecisionBackend | None:
+    dotted = os.environ.get("PYTHON_SETUP_LINT_DECISION_BACKEND")
+    if not os.environ.get("PYTEST_CURRENT_TEST") or not dotted:
+        return None
+    try:
+        module_name, _, attribute = dotted.partition(":")
+        return getattr(importlib.import_module(module_name), attribute)()
+    except AttributeError, ImportError, TypeError, ValueError:
+        _LOG.warning("decision_backend_load_failed", dotted_path=dotted)
+        return None
+
+
+@beartype
+def get_backend() -> DecisionBackend | None:
+    if os.environ.get("PYTHON_SETUP_LINT_RERANKER_MODEL") and "reranker" not in _WARNED:
+        _WARNED.add("reranker")
+        _LOG.warning("PYTHON_SETUP_LINT_RERANKER_MODEL is deprecated")
+    backend = _load_registered_backend()
+    model_id = os.environ.get("PYTHON_SETUP_LINT_DECISION_MODEL")
+    if backend is None and model_id is not None and "model" not in _WARNED:
+        _WARNED.add("model")
+        _LOG.warning("decision_model_unavailable", model=model_id)
+    return backend
diff --git a/src/python_setup_lint/checkers/_decision_backend.pyi b/src/python_setup_lint/checkers/_decision_backend.pyi
new file mode 100644
index 0000000..6ecb814
--- /dev/null
+++ b/src/python_setup_lint/checkers/_decision_backend.pyi
@@ -0,0 +1,16 @@
+from typing import Protocol, runtime_checkable
+
+DECISION_THRESHOLD: float
+PROMPT_VERSION: str
+
+@runtime_checkable
+class DecisionBackend(Protocol):
+    model_id: str
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
+
+class FakeBackend:
+    model_id: str
+    def __init__(self, score: float = 1.0) -> None: ...
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...
+
+def get_backend() -> DecisionBackend | None: ...
diff --git a/src/python_setup_lint/checkers/_semantic.py b/src/python_setup_lint/checkers/_semantic.py
index e3d9119..bf1934a 100644
--- a/src/python_setup_lint/checkers/_semantic.py
+++ b/src/python_setup_lint/checkers/_semantic.py
@@ -1,125 +1,28 @@
-# Semantic justification checker using a cross-encoder reranker (Track B).
-#
-# Single-stage NLP pipeline for evaluating suppression justification quality:
-#
-# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
-#    Re-score the justification against the rule and code context with a
-#    dedicated cross-encoder for higher accuracy.
-#
-# The model is loaded lazily (inside function calls, never at module level).
-# On ImportError (sentence-transformers not installed) or model download
-# failure, ``semantic_check_if_meaningful`` returns None, signalling the
-# caller to fall back to the heuristic check.
-
 from __future__ import annotations
 
-import contextlib
 import hashlib
-import json
-import os
-from pathlib import Path
-from typing import TYPE_CHECKING
 
-import structlog
 from beartype import beartype
 
+from python_setup_lint.checkers import _decision_backend
+from python_setup_lint.checkers._decision_backend import DecisionBackend
+
 __all__ = [
-    "_RERANKER_UNAVAILABLE",
-    "_load_reranker",
     "_reset_cache",
     "semantic_check_if_meaningful",
 ]
 
-_LOG = structlog.get_logger(__name__)
-if TYPE_CHECKING:
-    from sentence_transformers import CrossEncoder  # type: ignore[import-not-found]  # optional semantic extra
-
-# Cache directory for downloaded models (idempotent, .gitignored).
-_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
-
-# Model singleton cache (loaded once, reused across calls).
-_RERANKER_INSTANCE: CrossEncoder | None = None
-_RERANKER_UNAVAILABLE: bool = False
-
-# Persisted result cache file.
-_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
 # Lazy-loaded on first call to semantic_check_if_meaningful.
 _RESULT_CACHE: dict[int, bool] | None = None
 
-_RERANKER_MODEL = os.environ.get(
-    "PYTHON_SETUP_LINT_RERANKER_MODEL",
-    "jina-reranker-v2-base-multilingual",
-)
-
-
-def _load_result_cache() -> dict[int, bool]:
-    """Load the persisted result cache from disk.
-
-    Returns:
-        The loaded cache dict, or an empty dict if the cache file is missing or corrupt.
-    """
-    try:
-        raw = _RESULT_CACHE_FILE.read_text()
-        return {int(k): v for k, v in json.loads(raw).items()}
-    except FileNotFoundError:  # pylint: disable=W9740  # expected on first run, cache file doesn't exist yet
-        return {}
-    except json.JSONDecodeError, OSError, ValueError:
-        _LOG.warning("Failed to load result cache", exc_info=True)
-        return {}
-
-
-def _save_result_cache() -> None:
-    """Persist the result cache to disk."""
-    try:
-        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
-        assert _RESULT_CACHE is not None  # only called after lazy init
-        _RESULT_CACHE_FILE.write_text(json.dumps({str(k): v for k, v in _RESULT_CACHE.items()}))
-    except OSError:
-        _LOG.warning("Failed to save result cache", exc_info=True)
-
 
 def _reset_cache() -> None:
     """Reset the result cache (test helper).
 
-    Clears the in-memory cache and removes the persisted cache file.
+    Clears the in-process memo.
     """
-    global _RESULT_CACHE, _RERANKER_UNAVAILABLE  # pylint: disable=global-statement  # module-level cache reset requires global
+    global _RESULT_CACHE  # pylint: disable=global-statement  # memo reset requires global
     _RESULT_CACHE = None
-    _RERANKER_UNAVAILABLE = False
-    with contextlib.suppress(OSError):
-        _RESULT_CACHE_FILE.unlink(missing_ok=True)
-
-
-def _load_reranker() -> CrossEncoder | None:
-    """Lazy-load the cross-encoder reranker model.
-
-    Returns:
-        CrossEncoder instance, or ``None`` on failure.
-    """
-    global _RERANKER_INSTANCE, _RERANKER_UNAVAILABLE  # pylint: disable=global-statement  # lazy-load singleton requires global
-    if _RERANKER_UNAVAILABLE:
-        return None
-    if _RERANKER_INSTANCE is not None:
-        return _RERANKER_INSTANCE
-    try:
-        from sentence_transformers import CrossEncoder  # type: ignore[import-not-found]  # optional semantic extra
-    except ImportError:
-        _RERANKER_UNAVAILABLE = True
-        _LOG.debug("sentence_transformers not available, reranker disabled")
-        return None
-
-    try:
-        cache = _CACHE_DIR
-        cache.mkdir(parents=True, exist_ok=True)
-        _RERANKER_INSTANCE = CrossEncoder(
-            _RERANKER_MODEL,
-            cache_folder=str(cache),
-        )
-        return _RERANKER_INSTANCE
-    except OSError, RuntimeError, ValueError:
-        _RERANKER_UNAVAILABLE = True
-        _LOG.warning("Failed to load reranker model", exc_info=True)
-        return None
 
 
 @beartype
@@ -129,26 +32,27 @@ def semantic_check_if_meaningful(
     rule: str | None = None,
     code_context: str | None = None,
     comment: str | None = None,
+    backend: DecisionBackend | None = None,
 ) -> bool | None:
     # Use comment as primary text, fall back to raw text.
     primary = (comment or text).strip()
-    # Lazy-init the result cache on first call.
-    global _RESULT_CACHE  # pylint: disable=global-statement  # lazy-init result cache requires global
+    global _RESULT_CACHE  # pylint: disable=global-statement  # lazy-init memo requires global
     if _RESULT_CACHE is None:
-        _RESULT_CACHE = _load_result_cache()
+        _RESULT_CACHE = {}
     if not primary:
         return False
-
+    resolved = backend if backend is not None else _decision_backend.get_backend()
+    if resolved is None:
+        return None
     # Compute cache key from all inputs + model identifier.
     cache_key = hashlib.sha256(
         "|".join(
             str(x)
             for x in (
-                text,
+                primary,
                 rule,
                 code_context,
-                comment,
-                _RERANKER_MODEL,
+                resolved.model_id,
             )
         ).encode()
     ).digest()
@@ -156,34 +60,6 @@ def semantic_check_if_meaningful(
     if cache_key_int in _RESULT_CACHE:
         return _RESULT_CACHE[cache_key_int]
 
-    # --- Cross-encoder reranking ---
-    reranker = _load_reranker()
-    if reranker is None:
-        return None  # signal fallback to heuristic
-
-    # Build a query string from the available context.
-    # When rule or code_context is present, the query describes the suppressed code
-    # so the pair (primary, query) measures justification-vs-code relevance.
-    # When both are absent, fall back to self-pair (primary, primary).
-    if rule or code_context:
-        query_parts = []
-        if rule:
-            query_parts.append(f"rule: {rule}")
-        if code_context:
-            query_parts.append(f"context: {code_context[:200]}")  # truncate to avoid OOM
-        query = " | ".join(query_parts)
-    else:
-        query = primary
-
-    try:
-        pairs = [(primary, query)]
-        scores = reranker.predict(pairs)
-        score = float(scores[0])
-    except OSError, RuntimeError, ValueError:
-        _LOG.warning("Reranker prediction failed", exc_info=True)
-        return None
-
-    result = score >= 0.5
+    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
     _RESULT_CACHE[cache_key_int] = result
-    _save_result_cache()
     return result
diff --git a/src/python_setup_lint/checkers/_semantic.pyi b/src/python_setup_lint/checkers/_semantic.pyi
index 6f765ea..a21ffff 100644
--- a/src/python_setup_lint/checkers/_semantic.pyi
+++ b/src/python_setup_lint/checkers/_semantic.pyi
@@ -1,4 +1,6 @@
-"""Semantic justification checker using sentence-transformers (Track B)."""
+"""Semantic justification adapter over an optional decision backend."""
+
+from python_setup_lint.checkers._decision_backend import DecisionBackend
 
 def semantic_check_if_meaningful(
     text: str,
@@ -6,22 +8,18 @@ def semantic_check_if_meaningful(
     rule: str | None = None,
     code_context: str | None = None,
     comment: str | None = None,
+    backend: DecisionBackend | None = None,
 ) -> bool | None:
     """Check if a suppression justification is semantically meaningful.
 
-    Single-stage NLP pipeline using a cross-encoder reranker:
-
-    1. Re-score the justification against the rule and code context.
-
     Args:
         text: The raw justification text (used as fallback when *comment*
             is not provided).
         rule: The lint rule identifier being suppressed (e.g. ``"E501"``).
         code_context: Surrounding source code lines.
         comment: The justification comment text (preferred over *text*).
+        backend: A decision backend; ``None`` resolves the registered backend.
 
     Returns:
-        ``True`` if the justification is semantically meaningful,
-        ``False`` otherwise, or ``None`` if the NLP pipeline is unavailable
-        (sentence-transformers not installed or model download failed).
+        The backend verdict, or ``None`` when no backend is available.
     """
diff --git a/src/python_setup_lint/checkers/conformance/no_try_import_checker.py b/src/python_setup_lint/checkers/conformance/no_try_import_checker.py
index 791aae6..3aeac9a 100644
--- a/src/python_setup_lint/checkers/conformance/no_try_import_checker.py
+++ b/src/python_setup_lint/checkers/conformance/no_try_import_checker.py
@@ -9,7 +9,8 @@ from python_setup_lint.checkers._base import MessageDef, _msgs
 
 # Optional dependency import patterns — try/except ImportError is allowed
 # for imports from these modules (declared in [project.optional-dependencies]).
-_OPTIONAL_IMPORT_PATTERNS: frozenset[str] = frozenset({"sentence_transformers"})
+# The [semantic] extra is an empty placeholder, so no import is optional today.
+_OPTIONAL_IMPORT_PATTERNS: frozenset[str] = frozenset()
 
 
 def _all_imports_optional(stmts: list[nodes.NodeNG]) -> bool:
diff --git a/tests/assumptions/test_pylint_cache_semantics.py b/tests/assumptions/test_pylint_cache_semantics.py
index a6703f5..2e58fab 100644
--- a/tests/assumptions/test_pylint_cache_semantics.py
+++ b/tests/assumptions/test_pylint_cache_semantics.py
@@ -1,48 +1,38 @@
-"""Pin the writer, timing, and ``--path`` scoping of the cache written during pylint runs.
+"""Pin read-only semantic checks and pylint's single-writer invocation shape.
 
 Observed at HEAD with pylint 4.0.6 -- the current floor in ``pyproject.toml``
 (``pylint>=4.0.6``), so these tests double as the upgrade watchdog: a newer
 pylint that shifts the ``jobs`` default or the ``check_parallel`` dispatch
-fails them.  The tracked cache in this verdict is the semantic result cache
-consumed by ``epic-semantic-infrastructure`` -- not pylint's separate
-persistent ``~/.cache/pylint/*.stats`` bookkeeping (a Linux example; pylint's
-persistent-data home is platform-dependent).
+fails them.
+
+The semantic pipeline is a thin decision-backend adapter: verdicts are
+memoized in-process only (one backend call per unique input/model pair) and
+normal lint runs write nothing to disk. The git-tracked decision cache is a
+separate epic; these tests pin the read-only behavior and the sequential
+single-writer invocation shape that the tracked cache will rely on.
 
 WRITER-FIRST VERDICT (feeds ``cache-design-spike``)
 ===================================================
-* **Writer identity** -- the checker call path writes the cache while pylint is
-  linting: ``python_setup_lint.checkers._semantic.semantic_check_if_meaningful``
-  calls ``_save_result_cache``.  The runner performs no post-process merge and
-  checker ``open()``/``close()`` hooks do not write the file.
-* **Timing** -- one whole-file rewrite per newly computed verdict (cache miss),
-  synchronously before the check returns.  Cache hits, heuristic fallbacks
-  (reranker unavailable), and the empty-primary short-circuit (``False``
-  before key computation) write nothing.
+* **Writer identity** -- no checker call path writes a result cache. The
+  in-process memo lives only for the duration of the process.
+* **Timing** -- one backend ``decide`` call per unique
+  ``(text, rule, context, comment, model_id)`` pair; repeats hit the memo and
+  call neither the backend nor the filesystem.
 * **``--path`` scoping** -- the runner's ``--path`` narrows only the file
-  arguments passed to each pylint invocation.  The cache is a single
-  home-directory file and the key is SHA-256 over
-  ``(text, rule, code_context, comment, model)``: no file path participates, so
-  scoped and full runs share entries across the sequential ``pylint``,
-  ``pylint-pyi`` and ``pylint tests`` invocations.
-* **Sweep implication** -- because cache identity is path-free, ``--path``
-  cannot partition the cache.  Prune/sweep scope would need per-entry file
-  references -- a future tracked schema needs a ``files`` field per entry;
-  today's schema is only ``dict[int, bool]`` -- not the lint invocation's path
-  argument.
+  arguments passed to each pylint invocation; the semantic API takes no path.
 * **Concurrency** -- the runner executes tools sequentially and none of the
   three pylint specs passes ``-j``/``--jobs``; pylint's default ``jobs`` is 1,
   and the shipped ``config/.pylintrc*`` files do not raise it (watchdog test).
   The single-writer claim holds *only while the effective ``jobs`` is 1*, so
-  no lockfile, runner-side merge, or sidecar files are required today.  The
+  no lockfile, runner-side merge, or sidecar files are required today. The
   runner resolves the rcfile from ``--config pylint=PATH``, then
   ``cwd/config/.pylintrc``, then ``cwd/.pylintrc``: a consumer rcfile or
   override that sets ``jobs > 1`` (or ``jobs = 0`` auto-detect) silently
-  enables pylint's process pool and voids the claim.  If that happens, pylint
+  enables pylint's process pool and voids the claim. If that happens, pylint
   dispatches separate processes and the verdict flips to per-writer sidecars
   plus a runner merge (or a crash-safe lock plus atomic replace).
-* **Crash safety** -- the writer is a non-atomic ``Path.write_text``.  A crash
-  mid-write can lose entries but cannot break lint: unparsable JSON loads as an
-  empty cache and is recomputed.
+* **Crash safety** -- there is no partial-write surface: the semantic path does
+  not persist anything during lint.
 
 These tests *are* the verdict: when one fails, re-derive the writer-first
 semantics before changing the assertion rather than loosening it.
@@ -52,18 +42,18 @@ from __future__ import annotations
 
 import ast
 import configparser
-import hashlib
 import inspect
-import json
 from pathlib import Path
-from typing import Any, cast
 
 import pylint.lint.parallel as pylint_parallel
 import pytest
 from pylint.lint import PyLinter
 
 import python_setup_lint.checkers._semantic as semantic_module
-from python_setup_lint.checkers._semantic import semantic_check_if_meaningful
+from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private test helper omitted from .pyi
+    _reset_cache,
+    semantic_check_if_meaningful,
+)
 from python_setup_lint.runner._config import _default_config_paths
 from python_setup_lint.runner.cmd_build import _resolve_pylintrc
 from python_setup_lint.runner.dispatch import TOOLS, TOOLS_BY_NAME, _strategy_for
@@ -76,34 +66,6 @@ _REPO_ROOT = Path(__file__).resolve().parents[2]
 _SHIPPED_PYLINT_RCFILES = tuple(sorted((_REPO_ROOT / "config").glob(".pylintrc*")))
 
 
-class _FakeReranker:
-    """Stand-in for the optional cross-encoder so cache writes are exercised offline."""
-
-    def __init__(self, score: float) -> None:
-        self.score = score
-        self.calls = 0
-
-    def predict(self, _pairs: list[tuple[str, str]]) -> list[float]:
-        """Return a fixed score and count invocations."""
-        self.calls += 1
-        return [self.score]
-
-
-def _expected_cache_key(text: str, *, rule: str, code_context: str, comment: str) -> int:
-    """Compute the documented path-free cache key independently of the writer."""
-    model = cast(Any, semantic_module)._RERANKER_MODEL
-    payload = f"{text}|{rule}|{code_context}|{comment}|{model}"
-    return int.from_bytes(hashlib.sha256(payload.encode()).digest()[:8], "big")
-
-
-def _is_save_result_cache_call(node: ast.Call) -> bool:
-    """Match bare and attribute-qualified calls to the cache writer."""
-    func = node.func
-    if isinstance(func, ast.Name):
-        return func.id == "_save_result_cache"
-    return isinstance(func, ast.Attribute) and func.attr == "_save_result_cache"
-
-
 def _pylintrc_jobs_overrides(rcfile: Path) -> list[tuple[str, int]]:
     """Return effective ``jobs`` options from *rcfile* as ``(section, value)`` pairs.
 
@@ -115,194 +77,108 @@ def _pylintrc_jobs_overrides(rcfile: Path) -> list[tuple[str, int]]:
     return [(section, int(parser[section]["jobs"])) for section in parser.sections() if parser.has_option(section, "jobs")]
 
 
-@pytest.fixture
-def semantic_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
-    """Route the semantic result cache to a per-test directory."""
-    cache_dir = tmp_path / "semantic"
-    cache_file = cache_dir / "results.json"
-    monkeypatch.setattr("python_setup_lint.checkers._semantic._CACHE_DIR", cache_dir)
-    monkeypatch.setattr("python_setup_lint.checkers._semantic._RESULT_CACHE_FILE", cache_file)
-    monkeypatch.setattr("python_setup_lint.checkers._semantic._RESULT_CACHE", None)
-    return cache_file
+class _RecordingBackend:
+    """Stand-in for the optional decision backend so calls are exercised offline."""
 
+    def __init__(self, score: float = 0.9, model_id: str = "recording rev test prompt-v1") -> None:
+        self.score = score
+        self.model_id = model_id
+        self.calls: list[tuple[str, str | None, str | None]] = []
 
-class TestSemanticCacheWriter:
-    """Writer identity and timing of the cache produced inside a pylint run."""
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float:
+        """Return a fixed score and count invocations."""
+        self.calls.append((justification, rule, context))
+        return self.score
 
-    def test_semantic_check_if_meaningful_given_new_verdicts_then_writes_each_miss_immediately(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: the in-process check call is the writer; each miss rewrites the file."""
-        reranker = _FakeReranker(score=0.9)
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: reranker)
-
-        assert not semantic_cache.exists()
-
-        assert (
-            semantic_check_if_meaningful(
-                "guarded by a lock",
-                rule="W9704",
-                code_context="lock = Lock()",
-                comment="guarded by a lock",
-            )
-            is True
-        )
-        first_payload = json.loads(semantic_cache.read_text())
-        assert list(first_payload.values()) == [True]
-
-        assert (
-            semantic_check_if_meaningful(
-                "retry is idempotent",
-                rule="W9704",
-                code_context="retry()",
-                comment="retry is idempotent",
-            )
-            is True
-        )
-        second_payload = json.loads(semantic_cache.read_text())
-        assert len(second_payload) == 2
-        assert first_payload.keys() <= second_payload.keys()
-        assert set(second_payload.values()) == {True}
-        assert reranker.calls == 2
-
-        # In-memory hit: no reranker call and no extra file rewrite.
-        assert (
-            semantic_check_if_meaningful(
-                "guarded by a lock",
-                rule="W9704",
-                code_context="lock = Lock()",
-                comment="guarded by a lock",
-            )
-            is True
-        )
-        assert reranker.calls == 2
-        assert json.loads(semantic_cache.read_text()) == second_payload
 
-    def test_semantic_check_if_meaningful_given_persisted_entry_then_serves_it_without_model_or_write(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: the cache is lazy-loaded from disk; a hit reaches neither writer nor model."""
-        text, rule, code_context, comment = (
-            "persisted verdict",
-            "W9704",
-            "guard()",
-            "persisted verdict",
+@pytest.fixture
+def semantic_disk(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
+    """Point the retired home cache at a per-test directory to prove no writes."""
+    cache_dir = tmp_path / "semantic"
+    monkeypatch.setattr("python_setup_lint.checkers._semantic._CACHE_DIR", cache_dir, raising=False)
+    monkeypatch.setattr(
+        "python_setup_lint.checkers._semantic._RESULT_CACHE_FILE",
+        cache_dir / "results.json",
+        raising=False,
+    )
+    monkeypatch.setattr("python_setup_lint.checkers._semantic._RESULT_CACHE", None, raising=False)
+    _reset_cache()
+    return cache_dir / "results.json"
+
+
+class TestSemanticInProcessMemo:
+    """Backend calls are memoized in-process; nothing is persisted during lint."""
+
+    def test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing(self, semantic_disk: Path) -> None:
+        """One backend call per unique pair; the retired cache path stays absent."""
+        backend = _RecordingBackend(score=0.9)
+
+        first = semantic_check_if_meaningful(
+            "guarded by a lock",
+            rule="W9704",
+            code_context="lock = Lock()",
+            comment="guarded by a lock",
+            backend=backend,
+        )
+        second = semantic_check_if_meaningful(
+            "retry is idempotent",
+            rule="W9704",
+            code_context="retry()",
+            comment="retry is idempotent",
+            backend=backend,
         )
-        key = _expected_cache_key(text, rule=rule, code_context=code_context, comment=comment)
-        semantic_cache.parent.mkdir(parents=True)
-        semantic_cache.write_text(json.dumps({str(key): False}))
-        persisted = semantic_cache.read_text()
-
-        def _unexpected_load() -> None:
-            raise AssertionError("cache hit must not load the reranker")
-
-        def _unexpected_write() -> None:
-            raise AssertionError("cache hit must not rewrite the result cache")
-
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", _unexpected_load)
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._save_result_cache", _unexpected_write)
-
-        assert semantic_check_if_meaningful(text, rule=rule, code_context=code_context, comment=comment) is False
-        assert semantic_cache.read_text() == persisted
-
-    def test_semantic_check_if_meaningful_given_reranker_unavailable_then_writes_no_entry(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: the heuristic fallback path (None) creates neither cache file nor directory."""
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: None)
 
-        assert semantic_check_if_meaningful("checked elsewhere", rule="W9704", code_context="x = 1") is None
-        assert not semantic_cache.exists()
-        assert not semantic_cache.parent.exists()
+        assert first is True
+        assert second is True
+        assert len(backend.calls) == 2
+        assert not semantic_disk.exists()
+        assert not semantic_disk.parent.exists()
+
+    def test_given_repeated_pair_then_serves_memory_without_backend_or_write(self, semantic_disk: Path) -> None:
+        """An in-memory hit calls neither the backend nor the filesystem."""
+        backend = _RecordingBackend(score=0.9)
+        kwargs = {
+            "rule": "W9704",
+            "code_context": "lock = Lock()",
+            "comment": "guarded by a lock",
+        }
 
-    def test_semantic_check_if_meaningful_given_empty_primary_then_returns_false_without_writing(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: the empty-primary short-circuit returns False before key computation and writes nothing."""
-        reranker = _FakeReranker(score=0.9)
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: reranker)
+        assert semantic_check_if_meaningful("guarded by a lock", backend=backend, **kwargs) is True
+        assert semantic_check_if_meaningful("guarded by a lock", backend=backend, **kwargs) is True
 
-        assert semantic_check_if_meaningful("", rule="W9704", code_context="x = 1", comment="   ") is False
-        assert reranker.calls == 0
-        assert not semantic_cache.exists()
-        assert not semantic_cache.parent.exists()
+        assert len(backend.calls) == 1
+        assert not semantic_disk.exists()
 
-    def test_semantic_check_if_meaningful_given_truncated_cache_file_then_recovers_with_new_entry(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
+    def test_given_backend_unavailable_then_returns_none_and_writes_nothing(
+        self, semantic_disk: Path, monkeypatch: pytest.MonkeyPatch
     ) -> None:
-        """OBSERVED: a crash-truncated file loads as empty and is replaced by a valid rewrite."""
-        semantic_cache.parent.mkdir(parents=True)
-        semantic_cache.write_text('{"truncated": tru')
-        reranker = _FakeReranker(score=0.9)
-        monkeypatch.setattr("python_setup_lint.checkers._semantic._load_reranker", lambda: reranker)
-
-        assert (
-            semantic_check_if_meaningful(
-                "crash tolerant",
-                rule="W9704",
-                code_context="cache = load()",
-                comment="crash tolerant",
-            )
-            is True
-        )
-        payload = json.loads(semantic_cache.read_text())
-        assert payload == {
-            str(
-                _expected_cache_key(
-                    "crash tolerant",
-                    rule="W9704",
-                    code_context="cache = load()",
-                    comment="crash tolerant",
-                )
-            ): True
-        }
+        """The heuristic fallback path (None) creates neither cache file nor directory."""
+        monkeypatch.setattr("python_setup_lint.checkers._decision_backend.get_backend", lambda: None)
 
-    def test_semantic_result_cache_given_single_writer_then_leaves_no_lock_or_sidecar_artifacts(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: sequential writes leave exactly ``results.json`` -- no lock or sidecar files."""
-        monkeypatch.setattr(
-            "python_setup_lint.checkers._semantic._load_reranker",
-            lambda: _FakeReranker(0.9),
-        )
+        assert semantic_check_if_meaningful("checked elsewhere", comment="checked elsewhere") is None
+        assert not semantic_disk.exists()
+        assert not semantic_disk.parent.exists()
 
-        assert semantic_check_if_meaningful("only writer", rule="W9704", code_context="x = 1", comment="only writer") is True
-        assert [entry.name for entry in sorted(semantic_cache.parent.iterdir())] == ["results.json"]
+    def test_given_empty_primary_then_returns_false_without_backend_or_write(self, semantic_disk: Path) -> None:
+        """The empty-primary short-circuit returns False before any backend call."""
+        backend = _RecordingBackend(score=0.9)
 
+        assert semantic_check_if_meaningful("", backend=backend) is False
+        assert backend.calls == []
+        assert not semantic_disk.parent.exists()
 
-class TestSemanticCachePathScoping:
-    """The cache is a single path-free store shared by every pylint invocation."""
 
-    def test_semantic_check_if_meaningful_given_identical_inputs_then_cache_key_ignores_source_path(
-        self, semantic_cache: Path, monkeypatch: pytest.MonkeyPatch
-    ) -> None:
-        """OBSERVED: key = SHA-256(text, rule, context, comment, model); the API takes no path."""
-        monkeypatch.setattr(
-            "python_setup_lint.checkers._semantic._load_reranker",
-            lambda: _FakeReranker(0.9),
-        )
-        text, rule, code_context, comment = (
-            "path free key",
-            "W9704",
-            "value = load()",
-            "path free key",
-        )
+class TestSemanticPathScoping:
+    """The semantic API is path-free and does not persist a result store."""
 
-        assert semantic_check_if_meaningful(text, rule=rule, code_context=code_context, comment=comment) is True
-        expected = _expected_cache_key(text, rule=rule, code_context=code_context, comment=comment)
-        assert json.loads(semantic_cache.read_text()) == {str(expected): True}
+    def test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free(self, semantic_disk: Path) -> None:
+        """The API takes no path and writes no cache."""
+        backend = _RecordingBackend(score=0.9)
 
+        assert semantic_check_if_meaningful("path free key", comment="path free key", backend=backend) is True
         signature = inspect.signature(semantic_check_if_meaningful)
         assert set(signature.parameters).isdisjoint({"path", "file", "filename"})
-
-    def test_semantic_result_cache_file_given_runner_invocations_then_single_home_location(
-        self,
-    ) -> None:
-        """OBSERVED: one process-independent cache file, not a per-path or per-cwd cache."""
-        module = cast(Any, semantic_module)
-        expected_dir = Path.home() / ".cache" / "python-setup" / "semantic"
-        assert expected_dir == module._CACHE_DIR
-        assert (expected_dir / "results.json") == module._RESULT_CACHE_FILE
+        assert not semantic_disk.exists()
 
     def test_runner_pylint_commands_given_path_scope_then_scope_file_targets_only(self, tmp_path: Path) -> None:
         """OBSERVED: --path narrows lint targets; default runs keep each tool's own scope."""
@@ -332,42 +208,26 @@ class TestSemanticCachePathScoping:
             command = _strategy_for(tool_name, TOOLS_BY_NAME[tool_name]).build_command(config=config)
             assert expected_target in command
 
-    def test_semantic_cache_writer_given_source_tree_then_only_check_call_path_writes(
+    def test_checker_sources_given_source_tree_then_no_result_cache_writer(
         self,
     ) -> None:
-        """OBSERVED: `_save_result_cache` has one caller; runner code never performs a merge."""
-        source = Path(semantic_module.__file__).read_text()
-        tree = ast.parse(source)
-        save_calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and _is_save_result_cache_call(node)]
-        assert len(save_calls) == 1
-        callers = [
-            node.name
-            for node in ast.walk(tree)
-            if isinstance(node, ast.FunctionDef)
-            and any(isinstance(call, ast.Call) and _is_save_result_cache_call(call) for call in ast.walk(node))
-        ]
-        assert callers == ["semantic_check_if_meaningful"]
-
-        runner_dir = Path(semantic_module.__file__).parent.parent / "runner"
-        assert not [
-            path.name
-            for path in runner_dir.rglob("*.py")
-            if "_save_result_cache" in path.read_text() or "_RESULT_CACHE_FILE" in path.read_text()
-        ]
-
+        """OBSERVED: no checker module persists semantic results during lint."""
         checkers_dir = Path(semantic_module.__file__).parent
-        assert not [
+        offenders = [
             path.name
             for path in checkers_dir.rglob("*.py")
-            if path.name != Path(semantic_module.__file__).name
-            and ("_save_result_cache" in path.read_text() or "_RESULT_CACHE_FILE" in path.read_text())
+            if "_save_result_cache" in path.read_text() or "results.json" in path.read_text()
         ]
 
+        assert offenders == []
+
 
 class TestPylintRcfileJobsWatchdog:
     """Shipped rcfiles must leave pylint's ``jobs`` at 1 so the cache writer stays single."""
 
-    def test_shipped_pylint_rcfiles_given_effective_options_then_never_enable_worker_pool(self) -> None:
+    def test_shipped_pylint_rcfiles_given_effective_options_then_never_enable_worker_pool(
+        self,
+    ) -> None:
         """OBSERVED: every shipped rcfile leaves ``jobs`` at its default of 1."""
         assert _SHIPPED_PYLINT_RCFILES
         for rcfile in _SHIPPED_PYLINT_RCFILES:
@@ -380,9 +240,15 @@ class TestPylintRcfileJobsWatchdog:
 
         assert _pylintrc_jobs_overrides(rcfile) == [("MAIN", 2)]
 
-    def test_runner_pylint_config_resolution_given_repo_root_then_uses_shipped_jobs_free_rcfiles(self) -> None:
+    def test_runner_pylint_config_resolution_given_repo_root_then_uses_shipped_jobs_free_rcfiles(
+        self,
+    ) -> None:
         """OBSERVED: all three pylint invocations resolve to shipped, jobs-free rcfiles."""
-        expected_names = {"pylint": ".pylintrc", "pylint-pyi": ".pylintrc-pyi", "pylint tests": ".pylintrc-tests"}
+        expected_names = {
+            "pylint": ".pylintrc",
+            "pylint-pyi": ".pylintrc-pyi",
+            "pylint tests": ".pylintrc-tests",
+        }
         resolved = {
             "pylint": _resolve_pylintrc({}, _REPO_ROOT),
             "pylint-pyi": _default_config_paths(_REPO_ROOT).get("pylint-pyi"),
@@ -448,11 +314,15 @@ class TestPylintInvocationConcurrency:
 
         assert dispatched == [2]
 
-    def test_pylint_check_parallel_given_worker_pool_then_uses_process_pool_executor(self) -> None:
+    def test_pylint_check_parallel_given_worker_pool_then_uses_process_pool_executor(
+        self,
+    ) -> None:
         """OBSERVED: parallel pylint workers are processes, not threads, so each writes separately."""
         assert "ProcessPoolExecutor" in inspect.getsource(pylint_parallel.check_parallel)
 
-    def test_runner_pipeline_given_tool_selection_then_dispatches_tools_serially(self) -> None:
+    def test_runner_pipeline_given_tool_selection_then_dispatches_tools_serially(
+        self,
+    ) -> None:
         """OBSERVED: ``_run_tool_pipeline`` blocks on ``_run_cmd`` in one loop; no pool imports."""
         runner_dir = Path(semantic_module.__file__).parent.parent / "runner"
         for path in runner_dir.rglob("*.py"):
diff --git a/tests/checkers/test_decision_backend.py b/tests/checkers/test_decision_backend.py
new file mode 100644
index 0000000..464d2f1
--- /dev/null
+++ b/tests/checkers/test_decision_backend.py
@@ -0,0 +1,337 @@
+"""Behavioral tests for the veto ``DecisionBackend`` pipeline.
+
+These tests pin ADR-010 (runtime pinning, hermetic production default) and
+ADR-014 (heuristic-first veto, backend injection, ``None`` fallback, pinned
+threshold/prompt, in-process deduplication).  No model is downloaded or
+imported: every backend used here is a test double.
+"""
+
+from __future__ import annotations
+
+import inspect
+import tomllib
+from collections.abc import Callable, Iterator
+from pathlib import Path
+from typing import cast
+
+import pytest
+from structlog.testing import capture_logs
+
+from python_setup_lint.checkers import _base, _decision_backend, _semantic
+from python_setup_lint.checkers._base import check_if_meaningful
+from python_setup_lint.checkers._decision_backend import (  # type: ignore[attr-defined]  # private test helper omitted from .pyi
+    DECISION_THRESHOLD,
+    PROMPT_VERSION,
+    DecisionBackend,
+    FakeBackend,
+    _reset_backend_state,
+    get_backend,
+)
+from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private test helper omitted from .pyi
+    _reset_cache,
+)
+
+_REPO_ROOT = Path(__file__).resolve().parents[2]
+_BACKEND_ENV = "PYTHON_SETUP_LINT_DECISION_BACKEND"
+_MODEL_ENV = "PYTHON_SETUP_LINT_DECISION_MODEL"
+_RERANKER_ENV = "PYTHON_SETUP_LINT_RERANKER_MODEL"
+_SEMANTIC_ENV = "PYTHON_SETUP_LINT_SEMANTIC"
+_PYTEST_MARKER = "PYTEST_CURRENT_TEST"
+_MEANINGFUL = "circular import — PyLinter not available at runtime"
+_BRUSH_OFF = "pre-existing"
+
+
+class _RecordingBackend:
+    """Test double that records every ``decide`` call."""
+
+    def __init__(self, score: float = 1.0, model_id: str = "recording-backend rev test prompt-v1") -> None:
+        self.score = score
+        self.model_id = model_id
+        self.calls: list[tuple[str, str | None, str | None]] = []
+
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float:
+        """Record the pair and return the configured score."""
+        self.calls.append((justification, rule, context))
+        return self.score
+
+
+def _make_loader_backend() -> _RecordingBackend:
+    """Module-level factory resolved through the dotted-path override."""
+    return _RecordingBackend(score=1.0, model_id="dotted-loader rev test prompt-v1")
+
+
+def _make_rejecting_loader_backend() -> _RecordingBackend:
+    """Module-level factory that vetoes a heuristic-meaningful justification."""
+    return _RecordingBackend(score=0.0, model_id="dotted-rejector rev test prompt-v1")
+
+
+@pytest.fixture(autouse=True)
+def _isolate_backend_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
+    """Reset loader/warning state and environment around every test."""
+    _reset_backend_state()
+    _reset_cache()
+    for variable in (_BACKEND_ENV, _MODEL_ENV, _RERANKER_ENV):
+        monkeypatch.delenv(variable, raising=False)
+    yield
+    _reset_backend_state()
+    _reset_cache()
+
+
+# ── Pinned constants ────────────────────────────────────────────────
+
+
+def test_decision_threshold_is_pinned_at_half() -> None:
+    assert DECISION_THRESHOLD == 0.5
+
+
+def test_prompt_version_is_pinned() -> None:
+    assert PROMPT_VERSION == "prompt-v1"
+
+
+# ── FakeBackend ─────────────────────────────────────────────────────
+
+
+def test_fake_backend_defaults_to_one_and_pinned_model_id() -> None:
+    backend = FakeBackend()
+    assert backend.model_id == "fake-backend rev test prompt-v1"
+    assert backend.decide("guarded by a lock", "W9704", "lock = Lock()") == 1.0
+
+
+def test_fake_backend_returns_configured_score() -> None:
+    assert FakeBackend(score=0.25).decide("guarded by a lock", None, None) == 0.25
+
+
+def test_fake_backend_satisfies_protocol() -> None:
+    backend = FakeBackend()
+    assert isinstance(backend, DecisionBackend)
+    assert backend.model_id == "fake-backend rev test prompt-v1"
+
+
+# ── Loader ──────────────────────────────────────────────────────────
+
+
+def test_get_backend_is_none_without_configuration() -> None:
+    assert get_backend() is None
+
+
+def test_get_backend_honors_dotted_path_under_pytest(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setenv(
+        _PYTEST_MARKER,
+        "tests/checkers/test_decision_backend.py::test_get_backend (call)",
+    )
+    monkeypatch.setenv(_BACKEND_ENV, f"{__name__}:_make_loader_backend")
+
+    backend = get_backend()
+
+    assert backend is not None
+    assert backend.model_id == "dotted-loader rev test prompt-v1"
+
+
+def test_get_backend_ignores_dotted_path_in_production(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.delenv(_PYTEST_MARKER, raising=False)
+    monkeypatch.setenv(_BACKEND_ENV, "does.not.exist:backend")
+
+    assert get_backend() is None
+
+
+def test_decision_model_parses_but_yields_none_with_exactly_one_warning(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setenv(_MODEL_ENV, "glide-0.4b")
+
+    with capture_logs() as logs:
+        assert get_backend() is None
+        assert get_backend() is None
+
+    warnings = [entry for entry in logs if entry.get("log_level") == "warning"]
+    assert len(warnings) == 1
+
+
+def test_reranker_model_env_is_deprecated_with_exactly_one_warning(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setenv(_RERANKER_ENV, "jina-reranker-v2-base-multilingual")
+
+    with capture_logs() as logs:
+        get_backend()
+        get_backend()
+
+    warnings = [entry for entry in logs if entry.get("log_level") == "warning"]
+    assert len(warnings) == 1
+    assert "deprecated" in str(warnings[0]["event"]).lower()
+
+
+# ── Function contracts ──────────────────────────────────────────────
+
+
+def test_check_if_meaningful_has_backend_keyword_defaulting_to_none() -> None:
+    parameter = inspect.signature(check_if_meaningful).parameters.get("backend")
+    assert parameter is not None
+    assert parameter.default is None
+    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
+
+
+# ── Heuristic-first veto in ``check_if_meaningful`` ─────────────────
+
+
+def test_registered_backend_rejects_a_meaningful_heuristic(monkeypatch: pytest.MonkeyPatch) -> None:
+    monkeypatch.setenv(_BACKEND_ENV, f"{__name__}:_make_rejecting_loader_backend")
+
+    assert check_if_meaningful(_MEANINGFUL, rule="missing-beartype") is False
+
+
+def test_brush_off_is_vetoed_before_the_backend(monkeypatch: pytest.MonkeyPatch) -> None:
+    monkeypatch.setenv(_SEMANTIC_ENV, "1")
+    backend = _RecordingBackend(score=1.0)
+
+    result = check_if_meaningful(
+        _BRUSH_OFF,
+        rule="unjustified-suppression",
+        code_context="x = 1",
+        comment=_BRUSH_OFF,
+        backend=backend,
+    )
+
+    assert result is False
+    assert backend.calls == []
+
+
+def test_brush_off_does_not_reach_the_semantic_adapter(monkeypatch: pytest.MonkeyPatch) -> None:
+    monkeypatch.setenv(_SEMANTIC_ENV, "1")
+
+    def _unexpected_semantic_check(*args: object, **kwargs: object) -> None:
+        raise AssertionError("brush-off must be vetoed before semantic evaluation")
+
+    monkeypatch.setattr(_semantic, "semantic_check_if_meaningful", _unexpected_semantic_check)
+
+    assert check_if_meaningful(_BRUSH_OFF, comment=_BRUSH_OFF) is False
+
+
+def test_meaningful_heuristic_is_confirmed_by_backend(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setenv(_SEMANTIC_ENV, "1")
+    backend = _RecordingBackend(score=1.0)
+
+    result = check_if_meaningful(_MEANINGFUL, rule="missing-beartype", backend=backend)
+
+    assert result is True
+    assert len(backend.calls) == 1
+
+
+def test_backend_below_threshold_rejects_a_meaningful_heuristic() -> None:
+    backend = _RecordingBackend(score=0.0)
+
+    assert check_if_meaningful(_MEANINGFUL, backend=backend) is False
+
+
+def test_loader_none_falls_back_to_the_heuristic(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setattr(_decision_backend, "get_backend", lambda: None)
+
+    assert check_if_meaningful(_MEANINGFUL) is True
+
+
+def test_semantic_disabled_never_calls_the_backend(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    monkeypatch.setenv(_SEMANTIC_ENV, "0")
+    backend = _RecordingBackend(score=1.0)
+
+    assert check_if_meaningful(_MEANINGFUL, backend=backend) is True
+    assert backend.calls == []
+
+
+def test_bare_directive_stays_meaningful_when_semantic_disabled(
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    """A bare directive without a reason is accepted, as the golden sample requires."""
+    monkeypatch.setenv(_SEMANTIC_ENV, "0")
+    comment = "pylint: disable=some-rule"
+
+    result = check_if_meaningful(
+        comment,
+        comment=comment,
+        rule="unjustified-suppression",
+        code_context="def _bare_suppression() -> None:",
+    )
+
+    assert result is True
+
+
+# ── Suppressed-code normalization ──────────────────────────────────
+
+
+def _normalize(comment: str) -> str:
+    helper = getattr(_base, "normalize_suppressed_codes", None)
+    assert callable(helper), "_base.normalize_suppressed_codes must be implemented"
+    return cast("Callable[[str], str]", helper)(comment)  # pylint: disable=not-callable  # typing.cast result is callable; pylint cannot infer it
+
+
+@pytest.mark.parametrize(
+    "comment",
+    [
+        "type: ignore[assignment]  # assignment",
+        "type: ignore[assignment,arg-type]  # arg-type, assignment",
+        "noqa: E501, W9704  # W9704,E501",
+    ],
+)
+def test_normalize_suppressed_codes_drops_reason_that_echoes_codes(
+    comment: str,
+) -> None:
+    assert _normalize(comment) == ""
+
+
+@pytest.mark.parametrize(
+    "comment",
+    [
+        "type: ignore[assignment]  # carried from library httpx for type compatibility",
+        "carried from library httpx for type compatibility",
+    ],
+)
+def test_normalize_suppressed_codes_keeps_a_real_reason(comment: str) -> None:
+    assert _normalize(comment) == "carried from library httpx for type compatibility"
+
+
+@pytest.mark.parametrize(("comment", "expected"), [("W9704,E501", "W9704,E501"), ("assignment", "assignment")])
+def test_normalize_suppressed_codes_leaves_bare_text_unchanged(comment: str, expected: str) -> None:
+    assert _normalize(comment) == expected
+
+
+def test_check_if_meaningful_rejects_code_echo_justification() -> None:
+    comment = "type: ignore[assignment]  # assignment"
+
+    assert (
+        check_if_meaningful(
+            comment,
+            comment=comment,
+            rule="unjustified-suppression",
+            code_context="x: Any = 1",
+        )
+        is False
+    )
+
+
+# ── Packaging pins ──────────────────────────────────────────────────
+
+
+def test_semantic_extra_is_empty() -> None:
+    pyproject = tomllib.loads((_REPO_ROOT / "pyproject.toml").read_text())
+
+    assert pyproject["project"]["optional-dependencies"]["semantic"] == []
+
+
+def test_uv_lock_has_no_sentence_transformers_edge() -> None:
+    lock = tomllib.loads((_REPO_ROOT / "uv.lock").read_text())
+    packages = {package["name"]: package for package in lock["package"]}
+    root = packages["python-setup"]
+
+    assert "sentence-transformers" not in packages
+    assert root.get("optional-dependencies", {}).get("semantic", []) == []
+    requires_dist = root.get("metadata", {}).get("requires-dist", [])
+    assert all(dependency["name"] != "sentence-transformers" for dependency in requires_dist)
diff --git a/tests/checkers/test_no_try_import_checker.py b/tests/checkers/test_no_try_import_checker.py
index dbe74d7..91d14da 100644
--- a/tests/checkers/test_no_try_import_checker.py
+++ b/tests/checkers/test_no_try_import_checker.py
@@ -11,6 +11,7 @@ from typing import Any
 
 import pytest
 
+from python_setup_lint.checkers.conformance import no_try_import_checker
 from python_setup_lint.checkers.conformance.no_try_import_checker import (
     NoTryImportChecker,
 )
@@ -23,6 +24,22 @@ from tests.checkers._factories import (
 pytestmark = pytest.mark.no_external_api
 
 
+def test_sentence_transformers_is_no_longer_an_optional_import_pattern() -> None:
+    """The reranker dependency was removed from the shipped package."""
+    patterns: frozenset[str] = getattr(no_try_import_checker, "_OPTIONAL_IMPORT_PATTERNS", frozenset())
+    assert "sentence_transformers" not in patterns
+
+
+def test_try_import_of_sentence_transformers_is_flagged() -> None:
+    """A try/except guard for the removed dependency is now a violation."""
+    code = "try:\n    import sentence_transformers\nexcept ImportError:\n    pass\n"
+
+    msgs = _walk_and_release(code, NoTryImportChecker)
+
+    assert len(msgs) == 1
+    assert msgs[0].msg_id == "no-try-import"
+
+
 @pytest.mark.parametrize(
     ("code", "expected_count", "expected_args"),
     _NO_TRY_DETECT_CASES,
diff --git a/tests/checkers/test_semantic_check.py b/tests/checkers/test_semantic_check.py
index 5756341..dbf3b14 100644
--- a/tests/checkers/test_semantic_check.py
+++ b/tests/checkers/test_semantic_check.py
@@ -1,401 +1,133 @@
-"""Unit tests for python_setup_lint.checkers._semantic.
+"""Unit tests for ``python_setup_lint.checkers._semantic``.
 
-Tests the single-stage NLP ``semantic_check_if_meaningful`` function.
-
-Tests that require network access (model download) are marked ``@pytest.mark.slow``.
-Tests that hit the local model cache are **not** marked slow.
+The semantic pipeline is now a thin backend adapter: it resolves an optional
+``DecisionBackend`` (or uses the injected one), maps its score through the
+pinned ``0.5`` threshold, and memoizes one call per unique input/model pair.
+No model package is imported and nothing is written to disk.
 """
 
 from __future__ import annotations
 
-from collections.abc import Callable
-from unittest.mock import patch
+import inspect
+from collections.abc import Iterator
+from pathlib import Path
+from typing import Any
 
 import pytest
 
-from python_setup_lint.checkers._base import check_if_meaningful
+from python_setup_lint.checkers import _decision_backend, _semantic
+from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private test helper omitted from .pyi
+    _reset_cache,
+    semantic_check_if_meaningful,
+)
+
+
+class _RecordingBackend:
+    """Test double that records the pairs it is asked to score."""
+
+    def __init__(self, score: float = 1.0, model_id: str = "recording-backend rev test prompt-v1") -> None:
+        self.score = score
+        self.model_id = model_id
+        self.calls: list[tuple[str, str | None, str | None]] = []
+
+    def decide(self, justification: str, rule: str | None, context: str | None) -> float:
+        """Record the pair and return the configured score."""
+        self.calls.append((justification, rule, context))
+        return self.score
+
+
+@pytest.fixture(autouse=True)
+def _reset_semantic_state() -> Iterator[None]:
+    """Clear the in-process memo between tests."""
+    _reset_cache()
+    yield
+    _reset_cache()
+
+
+def test_signature_exposes_backend_keyword_defaulting_to_none() -> None:
+    parameter = inspect.signature(semantic_check_if_meaningful).parameters.get("backend")
+
+    assert parameter is not None
+    assert parameter.default is None
+    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
+
+
+def test_empty_primary_returns_false_without_calling_backend() -> None:
+    backend = _RecordingBackend()
+
+    assert semantic_check_if_meaningful("", backend=backend) is False
+    assert semantic_check_if_meaningful("   ", backend=backend) is False
+    assert backend.calls == []
+
 
+def test_loader_none_maps_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
+    monkeypatch.setattr(_decision_backend, "get_backend", lambda: None)
 
-class TestImportErrorFallback:
-    """When sentence_transformers is not installed, ImportError propagates."""
+    assert semantic_check_if_meaningful("guarded by a lock", comment="guarded by a lock") is None
 
-    def test_import_error_propagates(self) -> None:
-        """check_if_meaningful must propagate ImportError when _semantic unavailable."""
-        with patch(
-            "builtins.__import__",
-            side_effect=self._make_blocking_import(),
-        ):
-            with pytest.raises(ImportError, match="No module named _semantic"):
-                check_if_meaningful("circular import — PyLinter not available")
 
-    @staticmethod
-    def _make_blocking_import() -> Callable[..., object]:
-        """Return a side-effect function that blocks _semantic imports."""
-        original_import = __builtins__["__import__"]  # type: ignore[index]  # __builtins__ is a Module
+@pytest.mark.parametrize(("score", "expected"), [(0.0, False), (0.499, False), (0.5, True), (1.0, True)])
+def test_backend_score_maps_at_pinned_threshold(score: float, expected: bool) -> None:
+    backend = _RecordingBackend(score=score)
 
-        def _mock_import(name: str, *args: object, **kwargs: object) -> object:
-            if name == "python_setup_lint.checkers._semantic":
-                raise ImportError("No module named _semantic")
-            return original_import(name, *args, **kwargs)
+    result = semantic_check_if_meaningful(
+        "guarded by a lock",
+        rule="W9704",
+        code_context="lock = Lock()",
+        comment="guarded by a lock",
+        backend=backend,
+    )
 
-        return _mock_import
+    assert result is expected
 
 
-# ── Default-user fallback (semantic returns None → heuristic) ────────
+def test_one_backend_call_per_unique_pair() -> None:
+    backend = _RecordingBackend()
+    kwargs: dict[str, Any] = {
+        "rule": "W9704",
+        "code_context": "lock = Lock()",
+        "comment": "guarded by a lock",
+    }
 
+    first = semantic_check_if_meaningful("guarded by a lock", backend=backend, **kwargs)
+    second = semantic_check_if_meaningful("guarded by a lock", backend=backend, **kwargs)
 
-class TestDefaultUserFallback:
-    """Default-user path: semantic returns None → heuristic fallback executes."""
-
-    def test_fallback_to_heuristic_when_reranker_unavailable(self) -> None:
-        """When sentence_transformers absent, check_if_meaningful falls through to heuristic."""
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
-            _reset_cache,
-        )
-
-        _reset_cache()
-        with patch(
-            "python_setup_lint.checkers._semantic._load_reranker",
-            return_value=None,
-        ):
-            result = check_if_meaningful("circular import — PyLinter not available at runtime")
-        assert result is True
+    assert first is True
+    assert second is True
+    assert backend.calls == [("guarded by a lock", "W9704", "lock = Lock()")]
 
-    def test_fallback_rejects_brushoff_when_reranker_unavailable(self) -> None:
-        """The heuristic fallback must still reject brush-off justifications."""
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
-            _reset_cache,
-        )
 
-        _reset_cache()
-        with patch(
-            "python_setup_lint.checkers._semantic._load_reranker",
-            return_value=None,
-        ):
-            result = check_if_meaningful("pre-existing")
-        assert result is False
+def test_distinct_pairs_call_backend_again() -> None:
+    backend = _RecordingBackend()
 
+    semantic_check_if_meaningful("guarded by a lock", comment="guarded by a lock", backend=backend)
+    semantic_check_if_meaningful("retry is idempotent", comment="retry is idempotent", backend=backend)
 
-# ── Reranker import failure (sentinel prevents retry storm) ──────────
+    assert len(backend.calls) == 2
 
 
-class TestRerankerImportFallback:
-    """When sentence_transformers module cannot be imported inside _load_reranker.
+def test_memo_key_includes_backend_model_id() -> None:
+    first = _RecordingBackend(score=1.0, model_id="model-a rev test prompt-v1")
+    second = _RecordingBackend(score=0.0, model_id="model-b rev test prompt-v1")
 
-    The sentinel ``_RERANKER_UNAVAILABLE`` prevents repeated import attempts.
-    """
+    assert semantic_check_if_meaningful("guarded by a lock", comment="guarded by a lock", backend=first) is True
+    assert semantic_check_if_meaningful("guarded by a lock", comment="guarded by a lock", backend=second) is False
+    assert len(first.calls) == 1
+    assert len(second.calls) == 1
 
-    def test_import_error_returns_none_and_sets_sentinel(self) -> None:
-        """_load_reranker must return None and set sentinel on ImportError."""
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works
-            _load_reranker,
-            _reset_cache,
-        )
 
-        _reset_cache()
+def test_module_does_not_reference_sentence_transformers() -> None:
+    source = Path(_semantic.__file__).read_text()
 
-        with patch(
-            "builtins.__import__",
-            side_effect=self._make_blocking_import(),
-        ):
-            result = _load_reranker()
+    assert "sentence_transformers" not in source
+    assert "sentence-transformers" not in source
 
-        assert result is None
 
-        # Check sentinel via re-import (global was set by _load_reranker)
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
-            _RERANKER_UNAVAILABLE,
-        )
+def test_check_writes_no_disk_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
+    cache_dir = tmp_path / "semantic"
+    monkeypatch.setattr(_semantic, "_CACHE_DIR", cache_dir, raising=False)
+    monkeypatch.setattr(_semantic, "_RESULT_CACHE_FILE", cache_dir / "results.json", raising=False)
+    backend = _RecordingBackend()
 
-        assert _RERANKER_UNAVAILABLE is True
-
-        # Second call must skip import entirely
-        with patch(
-            "builtins.__import__",
-            side_effect=RuntimeError("should not be called"),
-        ) as mock_import:
-            result2 = _load_reranker()
-        assert result2 is None
-        mock_import.assert_not_called()
-
-    @staticmethod
-    def _make_blocking_import() -> Callable[..., object]:
-        """Return a side-effect function that blocks sentence_transformers imports."""
-        original_import = __builtins__["__import__"]  # type: ignore[index]  # __builtins__ is a Module
-
-        def _mock_import(name: str, *args: object, **kwargs: object) -> object:
-            if name == "sentence_transformers":
-                raise ImportError("No module named sentence_transformers")
-            return original_import(name, *args, **kwargs)
-
-        return _mock_import
-
-    def test_sentinel_prevents_retry_on_second_call(self) -> None:
-        """After sentinel is set, second _load_reranker call skips import."""
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works
-            _load_reranker,
-            _reset_cache,
-        )
-
-        _reset_cache()
-        with patch(
-            "python_setup_lint.checkers._semantic._RERANKER_UNAVAILABLE",
-            True,
-        ):
-            with patch(
-                "builtins.__import__",
-                side_effect=RuntimeError("should not be called"),
-            ) as mock_import:
-                result = _load_reranker()
-
-        assert result is None
-        mock_import.assert_not_called()
-
-
-# ── Semantic pipeline (requires sentence_transformers) ───────────────
-
-
-class TestSemanticCheck:
-    """Tests that exercise the NLP pipeline.
-
-    These tests require ``sentence_transformers`` to be importable
-    (``uv sync --extra semantic``).  Tests that download models are
-    marked ``@pytest.mark.slow``; cache-hit tests are not.
-    """
-
-    def test_meaningful_justification(self) -> None:
-        """A detailed technical justification should be meaningful."""
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful(
-            "circular import — PyLinter not available at runtime",
-            rule="missing-beartype",
-            code_context="def foo():  # pylint: disable=missing-beartype",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="circular import — PyLinter not available at runtime",
-        )
-        # If models are cached, this returns True/False; if not cached,
-        # model download may fail returning None. Either is acceptable.
-        assert result is None or isinstance(result, bool)
-
-    def test_empty_justification(self) -> None:
-        """Empty justification should return False."""
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful("")
-        assert result is False
-
-    def test_whitespace_justification(self) -> None:
-        """Whitespace-only justification should return False."""
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful("   ")
-        assert result is False
-
-    def test_returns_none_on_import_error(self) -> None:
-        """When sentence_transformers can't be imported, return None."""
-        with patch(
-            "python_setup_lint.checkers._semantic._load_reranker",
-            return_value=None,
-        ):
-            from python_setup_lint.checkers._semantic import (
-                semantic_check_if_meaningful,
-            )
-
-            result = semantic_check_if_meaningful("some reason")
-            assert result is None
-
-    def test_cache_hit_returns_cached_result(self) -> None:
-        """A cached result is returned without calling _load_reranker."""
-        import hashlib
-
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private import for white-box testing
-            _RERANKER_MODEL,
-            _reset_cache,
-            semantic_check_if_meaningful,
-        )
-
-        _reset_cache()
-
-        text = "some reason"
-        rule = "E501"
-        code_context = "x = 1"
-        comment = "some reason"
-
-        # Compute the cache key the same way the function does.
-        cache_key = hashlib.sha256(
-            "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
-        ).digest()
-        cache_key_int = int.from_bytes(cache_key[:8], "big")
-
-        # Pre-populate the cache with a known result.
-        with patch(
-            "python_setup_lint.checkers._semantic._RESULT_CACHE",
-            {cache_key_int: True},
-        ):
-            with patch(
-                "python_setup_lint.checkers._semantic._load_reranker",
-            ) as mock_load:
-                result = semantic_check_if_meaningful(
-                    text,
-                    rule=rule,
-                    code_context=code_context,
-                    comment=comment,
-                )
-                assert result is True
-                mock_load.assert_not_called()
-
-    @pytest.mark.slow
-    def test_semantic_with_model_download(self) -> None:
-        """End-to-end test that downloads models (slow, network required).
-
-        This test is marked ``slow`` because it downloads model artifacts.
-        On cache hit (models already downloaded), it runs quickly but is
-        still gated by the ``slow`` marker for safety.
-        """
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful(
-            "circular import — PyLinter not available at runtime",
-            rule="missing-beartype",
-            code_context="def foo():  # pylint: disable=missing-beartype",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="circular import — PyLinter not available at runtime",
-        )
-        if result is None:
-            pytest.skip("sentence-transformers model unavailable")
-        assert isinstance(result, bool)
-
-    @pytest.mark.slow
-    def test_semantic_meaningful_justification(self) -> None:
-        """A genuinely meaningful justification should pass the semantic check."""
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful(
-            "type stub not yet generated for this module",
-            rule="import-error",
-            code_context="import foo  # type: ignore",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="type stub not yet generated for this module",
-        )
-        if result is None:
-            pytest.skip("sentence-transformers model unavailable")
-        assert isinstance(result, bool)
-
-    @pytest.mark.slow
-    def test_semantic_weak_justification(self) -> None:
-        """A weak justification should fail the semantic check."""
-
-        from python_setup_lint.checkers._semantic import (
-            semantic_check_if_meaningful,
-        )
-
-        result = semantic_check_if_meaningful(
-            "noqa",
-            rule="E501",
-            code_context="x = 1  # noqa: E501",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="noqa",
-        )
-        # The heuristic would reject this; the semantic check may also
-        # reject it or return None if models aren't available.
-        assert result is False or result is None
-
-
-# ── Reranker pairs (requires sentence_transformers) ──────────────────
-
-
-class TestRerankerPairs:
-    """Tests that exercise the reranker with paired inputs.
-
-    These tests require ``sentence_transformers`` to be importable.
-    """
-
-    def test_reranker_pairs_meaningful(self) -> None:
-        """A meaningful justification with context should score >= 0.5."""
-        pytest.importorskip("sentence_transformers")
-
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works; private import for white-box testing
-            _reset_cache,
-            semantic_check_if_meaningful,
-        )
-
-        _reset_cache()
-
-        result = semantic_check_if_meaningful(
-            "circular import — PyLinter not available at runtime",
-            rule="missing-beartype",
-            code_context="def foo():  # pylint: disable=missing-beartype",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="circular import — PyLinter not available at runtime",
-        )
-        # If models are cached, this returns True; if not cached,
-        # model download may fail returning None.
-        assert result is True or result is None
-
-    def test_reranker_pairs_weak(self) -> None:
-        """A weak justification with context should score < 0.5."""
-        pytest.importorskip("sentence_transformers")
-
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works; private import for white-box testing
-            _reset_cache,
-            semantic_check_if_meaningful,
-        )
-
-        _reset_cache()
-
-        result = semantic_check_if_meaningful(
-            "noqa",
-            rule="E501",
-            code_context="x = 1  # noqa: E501",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="noqa",
-        )
-        # The reranker should reject this or return None if models aren't available.
-        assert result is False or result is None
-
-    def test_reranker_pairs_brush_off(self) -> None:
-        """A brush-off justification with context should score < 0.5."""
-        pytest.importorskip("sentence_transformers")
-
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works; private import for white-box testing
-            _reset_cache,
-            semantic_check_if_meaningful,
-        )
-
-        _reset_cache()
-
-        result = semantic_check_if_meaningful(
-            "pre-existing",
-            rule="E501",
-            code_context="x = 1  # noqa: E501",  # noqa: W9704  # code_context string contains suppression pattern as test data, not a real suppression
-            comment="pre-existing",
-        )
-        # The reranker should reject this or return None if models aren't available.
-        assert result is False or result is None
-
-    def test_reranker_pairs_meaningful_without_context(self) -> None:
-        """A meaningful justification without context should still score >= 0.5."""
-        pytest.importorskip("sentence_transformers")
-
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbols removed from .pyi per M3(b); runtime import still works; private import for white-box testing
-            _reset_cache,
-            semantic_check_if_meaningful,
-        )
-
-        _reset_cache()
-
-        result = semantic_check_if_meaningful(
-            "type stub not yet generated for this module",
-            comment="type stub not yet generated for this module",
-        )
-        assert result is True or result is None
+    assert semantic_check_if_meaningful("guarded by a lock", comment="guarded by a lock", backend=backend) is True
+    assert not cache_dir.exists()
diff --git a/tests/checkers/test_suppression_justification_checker.py b/tests/checkers/test_suppression_justification_checker.py
index 8ddf9f6..a1a0a8d 100644
--- a/tests/checkers/test_suppression_justification_checker.py
+++ b/tests/checkers/test_suppression_justification_checker.py
@@ -363,38 +363,30 @@ class C:
         assert len(msgs) == 0, f"Expected no messages, got {msgs}"
 
 
-@pytest.mark.slow  # requires sentence-transformers download
-class TestSuppressionRerankerPipeline:
-    """Full-pipeline integration test for reranker path.
-
-    Exercises the SuppressionJustificationChecker through the full pipeline
-    (heuristic + reranker) with brush-off and meaningful justifications.
-    Guarded with importorskip so it only runs when sentence-transformers is available.
-    """
-
-    def test_brush_off_rejected(self) -> None:
-        """Brush-off "pre-existing" must be rejected (W9704 emitted)."""
-        pytest.importorskip("sentence_transformers")
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
-            _reset_cache,
-        )
-
-        _reset_cache()
+@pytest.mark.usefixtures("_semantic_disabled")
+class TestAnyElementCodeEcho:
+    """A reason that merely echoes the suppressed codes is not a justification."""
 
-        code = "x: Any = 1  # type: ignore  # pre-existing\n"
+    def test_code_echo_on_any_element_is_rejected(self) -> None:
+        """A trailing reason equal to the suppressed code is not a justification."""
+        code = "x: Any = 1  # type: ignore[assignment]  # assignment\n"
         msgs = _walk_and_release(code, SuppressionJustificationChecker, file_path="src/mod.py")
-        assert len(msgs) >= 1, f"Expected at least 1 W9704 for brush-off, got {len(msgs)}"
-        assert "unjustified-suppression" in _msg_ids(msgs), f"Expected unjustified-suppression in {_msg_ids(msgs)}"
-
-    def test_meaningful_accepted(self) -> None:
-        """Meaningful justification must be accepted (no messages)."""
-        pytest.importorskip("sentence_transformers")
-        from python_setup_lint.checkers._semantic import (  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
-            _reset_cache,
-        )
-
-        _reset_cache()
+        assert len(msgs) == 1, f"Expected exactly one W9704, got {msgs}"
+
+    @pytest.mark.parametrize(
+        "code",
+        [
+            "x: Any = 1  # type: ignore[assignment]  # assignment\n",
+            "x: dict[str, Any] = {}  # type: ignore[assignment,arg-type]  # arg-type, assignment\n",
+            "x: Any = 1  # noqa: E501, W9704  # W9704,E501\n",
+            "def f(x: Any  # type: ignore[assignment]  # assignment\n) -> None:\n    pass\n",
+        ],
+    )
+    def test_code_echo_is_rejected_on_any_element(self, code: str) -> None:
+        msgs = _walk_and_release(code, SuppressionJustificationChecker, file_path="src/mod.py")
+        assert len(msgs) == 1, f"Expected exactly one W9704 for {code!r}, got {msgs}"
 
-        code = "x: Any = 1  # type: ignore  # carried from library httpx for type compatibility\n"
+    def test_real_reason_after_directive_is_accepted(self) -> None:
+        code = "x: Any = 1  # type: ignore[assignment]  # carried from library httpx for type compatibility\n"
         msgs = _walk_and_release(code, SuppressionJustificationChecker, file_path="src/mod.py")
-        assert len(msgs) == 0, f"Expected 0 messages for meaningful justification, got {len(msgs)}"
+        assert len(msgs) == 0, f"Expected no messages, got {msgs}"
diff --git a/uv.lock b/uv.lock
index 50ec06d..3ca3386 100644
--- a/uv.lock
+++ b/uv.lock
@@ -6,27 +6,6 @@ resolution-markers = [
     "python_full_version < '3.15'",
 ]
 
-[[package]]
-name = "annotated-doc"
-version = "0.0.4"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/57/ba/046ceea27344560984e26a590f90bc7f4a75b06701f653222458922b558c/annotated_doc-0.0.4.tar.gz", hash = "sha256:fbcda96e87e9c92ad167c2e53839e57503ecfda18804ea28102353485033faa4", size = 7288, upload-time = "2025-11-10T22:07:42.062Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/1e/d3/26bf1008eb3d2daa8ef4cacc7f3bfdc11818d111f7e2d0201bc6e3b49d45/annotated_doc-0.0.4-py3-none-any.whl", hash = "sha256:571ac1dc6991c450b25a9c2d84a3705e2ae7a53467b5d111c24fa8baabbed320", size = 5303, upload-time = "2025-11-10T22:07:40.673Z" },
-]
-
-[[package]]
-name = "anyio"
-version = "4.14.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "idna" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/3b/72/5562aabb8dd7181e8e860622a38bea08d17842b99ecd4c91f84ac95251b0/anyio-4.14.1.tar.gz", hash = "sha256:8d648a3544c1a700e3ff78615cd679e4c5c3f149904287e73687b2596963629e", size = 254831, upload-time = "2026-06-24T20:56:06.017Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/b0/7b/90df4a0a816d98d6ea26f559d87836d494a2cf1fcf063be67df50a7bcc30/anyio-4.14.1-py3-none-any.whl", hash = "sha256:4e5533c5b8ff0a24f5d7a176cbe6877129cd183893f66b537f8f227d10527d72", size = 124875, upload-time = "2026-06-24T20:56:04.413Z" },
-]
-
 [[package]]
 name = "ast-serialize"
 version = "0.5.0"
@@ -153,18 +132,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/db/8f/61959034484a4a7c527811f4721e75d02d653a35afb0b6054474d8185d4c/charset_normalizer-3.4.7-py3-none-any.whl", hash = "sha256:3dce51d0f5e7951f8bb4900c257dad282f49190fdbebecd4ba99bcc41fef404d", size = 61958, upload-time = "2026-04-02T09:28:37.794Z" },
 ]
 
-[[package]]
-name = "click"
-version = "8.4.2"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "colorama", marker = "sys_platform == 'win32'" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/76/d4/81420972a676e8ffea40450d8c8c92943e7218a78fe9b64359836cc9876b/click-8.4.2.tar.gz", hash = "sha256:9a6cea6e60b17ebe0a44c5cc636d94f09bd66142c1cd7d8b4cd731c4917a15f6", size = 338000, upload-time = "2026-06-24T17:45:15.148Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/fb/e2/79c688af8b210d232694e31e59da9f6ec747bae31c3f5946e4e9b98860d5/click-8.4.2-py3-none-any.whl", hash = "sha256:e6f9f66136c816745b9d65817da91d61d957fb16e02e4dcd0552553c5a197b76", size = 119243, upload-time = "2026-06-24T17:45:13.73Z" },
-]
-
 [[package]]
 name = "colorama"
 version = "0.4.6"
@@ -174,68 +141,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/d1/d6/3965ed04c63042e047cb6a3e6ed1a63a35087b6a609aa3a15ed8ac56c221/colorama-0.4.6-py2.py3-none-any.whl", hash = "sha256:4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6", size = 25335, upload-time = "2022-10-25T02:36:20.889Z" },
 ]
 
-[[package]]
-name = "cuda-bindings"
-version = "13.3.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "cuda-pathfinder" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/b1/81/bff68ce829999c1e4209c761bbf903b1c06ec570416ddb25020864ad5907/cuda_bindings-13.3.1-cp314-cp314-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:1ab2f74ed65bfef4163ba07a8db16f1085e0729291db12a2423aff84ee8278b8", size = 6013639, upload-time = "2026-05-29T23:12:03.509Z" },
-    { url = "https://files.pythonhosted.org/packages/d4/e0/c8a1f0c8f9ffdea4f5fe6dbab89b326cef4d85caf489dad39e209da89416/cuda_bindings-13.3.1-cp314-cp314-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:efd4c814d311ec08c981f6dded1dbe7d4b371067ee4f6c14cccec4bde9590f80", size = 6534419, upload-time = "2026-05-29T23:12:05.633Z" },
-    { url = "https://files.pythonhosted.org/packages/52/b8/83b1f563925b290f2d11a01a77a84013ba56052fe3653a5bef3ccfbb43d6/cuda_bindings-13.3.1-cp314-cp314t-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:c3c772dfff49681541d59630c90f858e173ac926b9c593a2b7123f2a1043cc76", size = 5809771, upload-time = "2026-05-29T23:12:10.422Z" },
-    { url = "https://files.pythonhosted.org/packages/12/20/e79b4bfe98f075195afb6343d41c498f9dbd2d161d7021d4d28bceb83581/cuda_bindings-13.3.1-cp314-cp314t-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:36febb7c1079d68a981dbbd8d5a67235b399802b82075c9388624719607e52b9", size = 6358584, upload-time = "2026-05-29T23:12:12.767Z" },
-]
-
-[[package]]
-name = "cuda-pathfinder"
-version = "1.5.5"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/11/c8/26f2e4aae92f11522a96043892ba39a90eac610d5242523aa863212bc1c7/cuda_pathfinder-1.5.5-py3-none-any.whl", hash = "sha256:0228c023f95d1480f143ef5c8922d27a2ab052087a942e81dc289c9eb8f91689", size = 51671, upload-time = "2026-05-27T01:21:25.413Z" },
-]
-
-[[package]]
-name = "cuda-toolkit"
-version = "13.0.2"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/57/b2/453099f5f3b698d7d0eab38916aac44c7f76229f451709e2eb9db6615dcd/cuda_toolkit-13.0.2-py2.py3-none-any.whl", hash = "sha256:b198824cf2f54003f50d64ada3a0f184b42ca0846c1c94192fa269ecd97a66eb", size = 2364, upload-time = "2025-12-19T23:24:07.328Z" },
-]
-
-[package.optional-dependencies]
-cudart = [
-    { name = "nvidia-cuda-runtime", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-cufft = [
-    { name = "nvidia-cufft", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-cufile = [
-    { name = "nvidia-cufile", marker = "sys_platform == 'linux'" },
-]
-cupti = [
-    { name = "nvidia-cuda-cupti", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-curand = [
-    { name = "nvidia-curand", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-cusolver = [
-    { name = "nvidia-cusolver", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-cusparse = [
-    { name = "nvidia-cusparse", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-nvjitlink = [
-    { name = "nvidia-nvjitlink", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-nvrtc = [
-    { name = "nvidia-cuda-nvrtc", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-nvtx = [
-    { name = "nvidia-nvtx", marker = "sys_platform == 'linux' or sys_platform == 'win32'" },
-]
-
 [[package]]
 name = "detect-secrets"
 version = "1.5.0"
@@ -276,15 +181,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/13/37/a065dc3bd6e49423a6532c642ca7378d3f467b1ef44c2800c937af7f9739/filelock-3.29.4-py3-none-any.whl", hash = "sha256:dac1648087d5115554850d113e7dd8c83ab2d38e3435dde2d4f163847e57b767", size = 42757, upload-time = "2026-06-13T16:11:59.582Z" },
 ]
 
-[[package]]
-name = "fsspec"
-version = "2026.6.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/10/a1/ae4e3e5003468d6391d2c77b6fa1cd73bd5d13511d81c642d7b28ac90ed4/fsspec-2026.6.0.tar.gz", hash = "sha256:f5bac145310fe30e16e1471bd6840b2d990d609e872251d7e674241822abf01a", size = 313646, upload-time = "2026-06-16T01:57:28.105Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/e5/22/4222d7ddf3da30f363edaa98e329c2bce6c65497c9cb2810931c8b2c0fbc/fsspec-2026.6.0-py3-none-any.whl", hash = "sha256:02e0b71817df9b2169dc30a16832045764def1191b43dcff5bb85bdee212d2a1", size = 203949, upload-time = "2026-06-16T01:57:26.358Z" },
-]
-
 [[package]]
 name = "gitdb"
 version = "4.0.12"
@@ -309,88 +205,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/20/7a/1c6e3562dfd8950adbb11ffbc65d21e7c89d01a6e4f137fa981056de25c5/gitpython-3.1.50-py3-none-any.whl", hash = "sha256:d352abe2908d07355014abdd21ddf798c2a961469239afec4962e9da884858f9", size = 212507, upload-time = "2026-05-06T04:01:23.799Z" },
 ]
 
-[[package]]
-name = "h11"
-version = "0.16.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/01/ee/02a2c011bdab74c6fb3c75474d40b3052059d95df7e73351460c8588d963/h11-0.16.0.tar.gz", hash = "sha256:4e35b956cf45792e4caa5885e69fba00bdbc6ffafbfa020300e549b208ee5ff1", size = 101250, upload-time = "2025-04-24T03:35:25.427Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/04/4b/29cac41a4d98d144bf5f6d33995617b185d14b22401f75ca86f384e87ff1/h11-0.16.0-py3-none-any.whl", hash = "sha256:63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86", size = 37515, upload-time = "2025-04-24T03:35:24.344Z" },
-]
-
-[[package]]
-name = "hf-xet"
-version = "1.5.1"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/4b/2d/57fd21d84d93efb4bd0b962383790e19dd1bc053501b4264c97903b4e83e/hf_xet-1.5.1.tar.gz", hash = "sha256:51ef4500dab3764b41135ee1381a4b62ce56fc54d4c92b719b59e597d6df5bf6", size = 876636, upload-time = "2026-06-08T23:02:53.897Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/05/24/5e0c28f80371c17d49fed004597d9d132cb75c1f6f53db2cb95f459d2312/hf_xet-1.5.1-cp314-cp314t-macosx_10_12_x86_64.whl", hash = "sha256:3474760d10e3bb6f92ff3f024fcb00c0b3e4001e9b035c7483e49a5dd17aa70f", size = 4069676, upload-time = "2026-06-08T23:02:26.759Z" },
-    { url = "https://files.pythonhosted.org/packages/d2/17/261ba565b6a4d960fb478f61fdf919c0be5824645aaf1c319eca660c1611/hf_xet-1.5.1-cp314-cp314t-macosx_11_0_arm64.whl", hash = "sha256:6762d89b9e3267dfd502b29b2a327b4525f33b17e7b509a78d94e2151a30ce30", size = 3838509, upload-time = "2026-06-08T23:02:28.573Z" },
-    { url = "https://files.pythonhosted.org/packages/4e/44/7ffdc2e184b0d41fc0f683ba3936ef669ab63cf242cf36ef50e57d683668/hf_xet-1.5.1-cp314-cp314t-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:bf67e6ed10260cef62e852789dc91ebb03f382d5bdc4b1dbeb64763ea275e7d6", size = 4505881, upload-time = "2026-06-08T23:02:30.257Z" },
-    { url = "https://files.pythonhosted.org/packages/63/b6/788060d5aa4d5e671f1a31bf69624c314eb2d8babab3aa562f9e5d53444e/hf_xet-1.5.1-cp314-cp314t-manylinux_2_28_aarch64.whl", hash = "sha256:c6b6cd08ca095058780b50b8ce4d6cbf6787bcf27841705d58a9d32246e3e47a", size = 4292995, upload-time = "2026-06-08T23:02:31.993Z" },
-    { url = "https://files.pythonhosted.org/packages/22/93/c5540cbd6b55529b7dc42f6734e88cebee21aefbea34128b66229df56c57/hf_xet-1.5.1-cp314-cp314t-musllinux_1_2_aarch64.whl", hash = "sha256:e1af0de8ca6f190d4294a28b88023db64a1e2d1d719cab044baf75bec569e7a9", size = 4491570, upload-time = "2026-06-08T23:02:33.86Z" },
-    { url = "https://files.pythonhosted.org/packages/03/f3/9d8ceab30f44f36c1679b1b8683054c71a0dadc787dbf07421891742d3ca/hf_xet-1.5.1-cp314-cp314t-musllinux_1_2_x86_64.whl", hash = "sha256:4f561cbbb92f80960772059864b7fb07eae879adde1b2e781ec6f86f6ac26c59", size = 4711565, upload-time = "2026-06-08T23:02:35.454Z" },
-    { url = "https://files.pythonhosted.org/packages/cd/54/27ed9a5e2cc583b4df82f75a03a4df8dbf55f5a9fa1f47f1fadfb20dbeac/hf_xet-1.5.1-cp314-cp314t-win_amd64.whl", hash = "sha256:e7dbb40617410f432182d918e37c12303fe6700fd6aa6c5964e30a535a4461d6", size = 4017343, upload-time = "2026-06-08T23:02:37.14Z" },
-    { url = "https://files.pythonhosted.org/packages/ae/12/ecb2fc8d45e767580e3a37faa97cb895608b614965567efb4f18cff67e27/hf_xet-1.5.1-cp314-cp314t-win_arm64.whl", hash = "sha256:6071d5ccb4d8d2cbd5fea5cc798da4f0ba3f44e25369591c4e89a4987050e61d", size = 3845716, upload-time = "2026-06-08T23:02:39.073Z" },
-    { url = "https://files.pythonhosted.org/packages/7a/d8/5e54cf37434759d1f4f2ba9b66077ff9d4c4e1f37b6bd7975da5c40d94ab/hf_xet-1.5.1-cp37-abi3-macosx_10_12_x86_64.whl", hash = "sha256:6abd35c3221eff63836618ddfb954dcf84798603f71d8e33e3ed7b04acfdbe6e", size = 4077794, upload-time = "2026-06-08T23:02:40.656Z" },
-    { url = "https://files.pythonhosted.org/packages/35/94/4b2ecfbad8f8b04701a23aefb62f540b9137d058b7e1dbef16a32676f0e9/hf_xet-1.5.1-cp37-abi3-macosx_11_0_arm64.whl", hash = "sha256:94e761bbd266bf4c03cee73753916062665ce8365aa40ed321f45afcb934b41e", size = 3845354, upload-time = "2026-06-08T23:02:42.702Z" },
-    { url = "https://files.pythonhosted.org/packages/de/cc/f99f4bc7295023d7bd9ebbfd51f75cc530ca262c1227666268b8208f4b77/hf_xet-1.5.1-cp37-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:892e3a3a3aecc12aded8b93cf4f9cd059282c7de0732f7d55026f3abdf474350", size = 4514864, upload-time = "2026-06-08T23:02:44.497Z" },
-    { url = "https://files.pythonhosted.org/packages/cd/6e/21f7e5a2381278bd3b7b7a5a4d90038518bb6308a0c1daf5d9f8268bb178/hf_xet-1.5.1-cp37-abi3-manylinux_2_28_aarch64.whl", hash = "sha256:a93df2039190502835b1db8cd7e178b0b7b889fe9ab51299d5ced26e0dd879a4", size = 4303784, upload-time = "2026-06-08T23:02:46.203Z" },
-    { url = "https://files.pythonhosted.org/packages/35/0e/f992bb6927ac1cb30ef74e62268f551f338bc32b2191f7c96a44c6f7283e/hf_xet-1.5.1-cp37-abi3-musllinux_1_2_aarch64.whl", hash = "sha256:0c97106032ef70467b4f6bc2d0ccc266d7613ee076afc56516c502f87ce1c4a6", size = 4500703, upload-time = "2026-06-08T23:02:47.628Z" },
-    { url = "https://files.pythonhosted.org/packages/fb/d1/90a498d05447980b977b1669246eeeeae4cfb0ea3e7a286eaba627f91bf9/hf_xet-1.5.1-cp37-abi3-musllinux_1_2_x86_64.whl", hash = "sha256:6208adb15d192b90e4c2ad2a27ed864359b2cb0f2494eb6d7c7f3699ac02e2bf", size = 4719498, upload-time = "2026-06-08T23:02:49.268Z" },
-    { url = "https://files.pythonhosted.org/packages/6d/b6/20f99cfe97cc663a711f7b33cc21d4793e51968e9a26125b4afcd77315ba/hf_xet-1.5.1-cp37-abi3-win_amd64.whl", hash = "sha256:f7b3002f95d1c13e24bcb4537baa8f0eb3838957067c91bb4959bc004a6435f5", size = 4026419, upload-time = "2026-06-08T23:02:50.829Z" },
-    { url = "https://files.pythonhosted.org/packages/f9/fa/77453694888f03e5a8c8852d1514a0894d8e81c622d39edbaf308ea0dcf4/hf_xet-1.5.1-cp37-abi3-win_arm64.whl", hash = "sha256:93d090b57b211133f6c0dab0205ef5cb6d89162979ba75a74845045cc3063b8e", size = 3855178, upload-time = "2026-06-08T23:02:52.452Z" },
-]
-
-[[package]]
-name = "httpcore"
-version = "1.0.9"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "certifi" },
-    { name = "h11" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/06/94/82699a10bca87a5556c9c59b5963f2d039dbd239f25bc2a63907a05a14cb/httpcore-1.0.9.tar.gz", hash = "sha256:6e34463af53fd2ab5d807f399a9b45ea31c3dfa2276f15a2c3f00afff6e176e8", size = 85484, upload-time = "2025-04-24T22:06:22.219Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/7e/f5/f66802a942d491edb555dd61e3a9961140fd64c90bce1eafd741609d334d/httpcore-1.0.9-py3-none-any.whl", hash = "sha256:2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55", size = 78784, upload-time = "2025-04-24T22:06:20.566Z" },
-]
-
-[[package]]
-name = "httpx"
-version = "0.28.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "anyio" },
-    { name = "certifi" },
-    { name = "httpcore" },
-    { name = "idna" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/b1/df/48c586a5fe32a0f01324ee087459e112ebb7224f646c0b5023f5e79e9956/httpx-0.28.1.tar.gz", hash = "sha256:75e98c5f16b0f35b567856f597f06ff2270a374470a5c2392242528e3e3e42fc", size = 141406, upload-time = "2024-12-06T15:37:23.222Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/2a/39/e50c7c3a983047577ee07d2a9e53faf5a69493943ec3f6a384bdc792deb2/httpx-0.28.1-py3-none-any.whl", hash = "sha256:d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad", size = 73517, upload-time = "2024-12-06T15:37:21.509Z" },
-]
-
-[[package]]
-name = "huggingface-hub"
-version = "1.21.0"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "click" },
-    { name = "filelock" },
-    { name = "fsspec" },
-    { name = "hf-xet", marker = "platform_machine == 'AMD64' or platform_machine == 'aarch64' or platform_machine == 'amd64' or platform_machine == 'arm64' or platform_machine == 'x86_64'" },
-    { name = "httpx" },
-    { name = "packaging" },
-    { name = "pyyaml" },
-    { name = "tqdm" },
-    { name = "typer" },
-    { name = "typing-extensions" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/8f/77/ce3331f40cb2d021fe9b24c46c41e72faf74493621138e5eddac12bf5e1c/huggingface_hub-1.21.0.tar.gz", hash = "sha256:a44f222cd8f2f7c2eade30b5e7a04cac984a3235fa61ea87a0a5a31db77d561f", size = 861572, upload-time = "2026-06-25T13:09:26.356Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/4f/85/b505a99a133d9f99d21af182af416e9baef70bdeef019983479651e494c2/huggingface_hub-1.21.0-py3-none-any.whl", hash = "sha256:eadaa3678c512c82aea69e8675d90a184861e68de32f1105668628b4dce0e7cd", size = 721078, upload-time = "2026-06-25T13:09:24.402Z" },
-]
-
 [[package]]
 name = "hypothesis"
 version = "6.155.7"
@@ -439,27 +253,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/3e/95/c7c34aa53c16353c56d0b802fba48d5f5caa2cdee7958acbcb795c830416/isort-8.0.1-py3-none-any.whl", hash = "sha256:28b89bc70f751b559aeca209e6120393d43fbe2490de0559662be7a9787e3d75", size = 89733, upload-time = "2026-02-28T10:08:19.466Z" },
 ]
 
-[[package]]
-name = "jinja2"
-version = "3.1.6"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "markupsafe" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/df/bf/f7da0350254c0ed7c72f3e33cef02e048281fec7ecec5f032d4aac52226b/jinja2-3.1.6.tar.gz", hash = "sha256:0137fb05990d35f1275a587e9aee6d56da821fc83491a0fb838183be43f66d6d", size = 245115, upload-time = "2025-03-05T20:05:02.478Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/62/a1/3d680cbfd5f4b8f15abc1d571870c5fc3e594bb582bc3b64ea099db13e56/jinja2-3.1.6-py3-none-any.whl", hash = "sha256:85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67", size = 134899, upload-time = "2025-03-05T20:05:00.369Z" },
-]
-
-[[package]]
-name = "joblib"
-version = "1.5.3"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/41/f2/d34e8b3a08a9cc79a50b2208a93dce981fe615b64d5a4d4abee421d898df/joblib-1.5.3.tar.gz", hash = "sha256:8561a3269e6801106863fd0d6d84bb737be9e7631e33aaed3fb9ce5953688da3", size = 331603, upload-time = "2025-12-15T08:41:46.427Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/7b/91/984aca2ec129e2757d1e4e3c81c3fcda9d0f85b74670a094cc443d9ee949/joblib-1.5.3-py3-none-any.whl", hash = "sha256:5fc3c5039fc5ca8c0276333a188bbd59d6b7ab37fe6632daa76bc7f9ec18e713", size = 309071, upload-time = "2025-12-15T08:41:44.973Z" },
-]
-
 [[package]]
 name = "librt"
 version = "0.11.0"
@@ -506,36 +299,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/b3/81/4da04ced5a082363ecfa159c010d200ecbd959ae410c10c0264a38cac0f5/markdown_it_py-4.2.0-py3-none-any.whl", hash = "sha256:9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a", size = 91687, upload-time = "2026-05-07T12:08:27.182Z" },
 ]
 
-[[package]]
-name = "markupsafe"
-version = "3.0.3"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/7e/99/7690b6d4034fffd95959cbe0c02de8deb3098cc577c67bb6a24fe5d7caa7/markupsafe-3.0.3.tar.gz", hash = "sha256:722695808f4b6457b320fdc131280796bdceb04ab50fe1795cd540799ebe1698", size = 80313, upload-time = "2025-09-27T18:37:40.426Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/33/8a/8e42d4838cd89b7dde187011e97fe6c3af66d8c044997d2183fbd6d31352/markupsafe-3.0.3-cp314-cp314-macosx_10_13_x86_64.whl", hash = "sha256:eaa9599de571d72e2daf60164784109f19978b327a3910d3e9de8c97b5b70cfe", size = 11619, upload-time = "2025-09-27T18:37:06.342Z" },
-    { url = "https://files.pythonhosted.org/packages/b5/64/7660f8a4a8e53c924d0fa05dc3a55c9cee10bbd82b11c5afb27d44b096ce/markupsafe-3.0.3-cp314-cp314-macosx_11_0_arm64.whl", hash = "sha256:c47a551199eb8eb2121d4f0f15ae0f923d31350ab9280078d1e5f12b249e0026", size = 12029, upload-time = "2025-09-27T18:37:07.213Z" },
-    { url = "https://files.pythonhosted.org/packages/da/ef/e648bfd021127bef5fa12e1720ffed0c6cbb8310c8d9bea7266337ff06de/markupsafe-3.0.3-cp314-cp314-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:f34c41761022dd093b4b6896d4810782ffbabe30f2d443ff5f083e0cbbb8c737", size = 24408, upload-time = "2025-09-27T18:37:09.572Z" },
-    { url = "https://files.pythonhosted.org/packages/41/3c/a36c2450754618e62008bf7435ccb0f88053e07592e6028a34776213d877/markupsafe-3.0.3-cp314-cp314-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:457a69a9577064c05a97c41f4e65148652db078a3a509039e64d3467b9e7ef97", size = 23005, upload-time = "2025-09-27T18:37:10.58Z" },
-    { url = "https://files.pythonhosted.org/packages/bc/20/b7fdf89a8456b099837cd1dc21974632a02a999ec9bf7ca3e490aacd98e7/markupsafe-3.0.3-cp314-cp314-manylinux_2_31_riscv64.manylinux_2_39_riscv64.whl", hash = "sha256:e8afc3f2ccfa24215f8cb28dcf43f0113ac3c37c2f0f0806d8c70e4228c5cf4d", size = 22048, upload-time = "2025-09-27T18:37:11.547Z" },
-    { url = "https://files.pythonhosted.org/packages/9a/a7/591f592afdc734f47db08a75793a55d7fbcc6902a723ae4cfbab61010cc5/markupsafe-3.0.3-cp314-cp314-musllinux_1_2_aarch64.whl", hash = "sha256:ec15a59cf5af7be74194f7ab02d0f59a62bdcf1a537677ce67a2537c9b87fcda", size = 23821, upload-time = "2025-09-27T18:37:12.48Z" },
-    { url = "https://files.pythonhosted.org/packages/7d/33/45b24e4f44195b26521bc6f1a82197118f74df348556594bd2262bda1038/markupsafe-3.0.3-cp314-cp314-musllinux_1_2_riscv64.whl", hash = "sha256:0eb9ff8191e8498cca014656ae6b8d61f39da5f95b488805da4bb029cccbfbaf", size = 21606, upload-time = "2025-09-27T18:37:13.485Z" },
-    { url = "https://files.pythonhosted.org/packages/ff/0e/53dfaca23a69fbfbbf17a4b64072090e70717344c52eaaaa9c5ddff1e5f0/markupsafe-3.0.3-cp314-cp314-musllinux_1_2_x86_64.whl", hash = "sha256:2713baf880df847f2bece4230d4d094280f4e67b1e813eec43b4c0e144a34ffe", size = 23043, upload-time = "2025-09-27T18:37:14.408Z" },
-    { url = "https://files.pythonhosted.org/packages/46/11/f333a06fc16236d5238bfe74daccbca41459dcd8d1fa952e8fbd5dccfb70/markupsafe-3.0.3-cp314-cp314-win32.whl", hash = "sha256:729586769a26dbceff69f7a7dbbf59ab6572b99d94576a5592625d5b411576b9", size = 14747, upload-time = "2025-09-27T18:37:15.36Z" },
-    { url = "https://files.pythonhosted.org/packages/28/52/182836104b33b444e400b14f797212f720cbc9ed6ba34c800639d154e821/markupsafe-3.0.3-cp314-cp314-win_amd64.whl", hash = "sha256:bdc919ead48f234740ad807933cdf545180bfbe9342c2bb451556db2ed958581", size = 15341, upload-time = "2025-09-27T18:37:16.496Z" },
-    { url = "https://files.pythonhosted.org/packages/6f/18/acf23e91bd94fd7b3031558b1f013adfa21a8e407a3fdb32745538730382/markupsafe-3.0.3-cp314-cp314-win_arm64.whl", hash = "sha256:5a7d5dc5140555cf21a6fefbdbf8723f06fcd2f63ef108f2854de715e4422cb4", size = 14073, upload-time = "2025-09-27T18:37:17.476Z" },
-    { url = "https://files.pythonhosted.org/packages/3c/f0/57689aa4076e1b43b15fdfa646b04653969d50cf30c32a102762be2485da/markupsafe-3.0.3-cp314-cp314t-macosx_10_13_x86_64.whl", hash = "sha256:1353ef0c1b138e1907ae78e2f6c63ff67501122006b0f9abad68fda5f4ffc6ab", size = 11661, upload-time = "2025-09-27T18:37:18.453Z" },
-    { url = "https://files.pythonhosted.org/packages/89/c3/2e67a7ca217c6912985ec766c6393b636fb0c2344443ff9d91404dc4c79f/markupsafe-3.0.3-cp314-cp314t-macosx_11_0_arm64.whl", hash = "sha256:1085e7fbddd3be5f89cc898938f42c0b3c711fdcb37d75221de2666af647c175", size = 12069, upload-time = "2025-09-27T18:37:19.332Z" },
-    { url = "https://files.pythonhosted.org/packages/f0/00/be561dce4e6ca66b15276e184ce4b8aec61fe83662cce2f7d72bd3249d28/markupsafe-3.0.3-cp314-cp314t-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:1b52b4fb9df4eb9ae465f8d0c228a00624de2334f216f178a995ccdcf82c4634", size = 25670, upload-time = "2025-09-27T18:37:20.245Z" },
-    { url = "https://files.pythonhosted.org/packages/50/09/c419f6f5a92e5fadde27efd190eca90f05e1261b10dbd8cbcb39cd8ea1dc/markupsafe-3.0.3-cp314-cp314t-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:fed51ac40f757d41b7c48425901843666a6677e3e8eb0abcff09e4ba6e664f50", size = 23598, upload-time = "2025-09-27T18:37:21.177Z" },
-    { url = "https://files.pythonhosted.org/packages/22/44/a0681611106e0b2921b3033fc19bc53323e0b50bc70cffdd19f7d679bb66/markupsafe-3.0.3-cp314-cp314t-manylinux_2_31_riscv64.manylinux_2_39_riscv64.whl", hash = "sha256:f190daf01f13c72eac4efd5c430a8de82489d9cff23c364c3ea822545032993e", size = 23261, upload-time = "2025-09-27T18:37:22.167Z" },
-    { url = "https://files.pythonhosted.org/packages/5f/57/1b0b3f100259dc9fffe780cfb60d4be71375510e435efec3d116b6436d43/markupsafe-3.0.3-cp314-cp314t-musllinux_1_2_aarch64.whl", hash = "sha256:e56b7d45a839a697b5eb268c82a71bd8c7f6c94d6fd50c3d577fa39a9f1409f5", size = 24835, upload-time = "2025-09-27T18:37:23.296Z" },
-    { url = "https://files.pythonhosted.org/packages/26/6a/4bf6d0c97c4920f1597cc14dd720705eca0bf7c787aebc6bb4d1bead5388/markupsafe-3.0.3-cp314-cp314t-musllinux_1_2_riscv64.whl", hash = "sha256:f3e98bb3798ead92273dc0e5fd0f31ade220f59a266ffd8a4f6065e0a3ce0523", size = 22733, upload-time = "2025-09-27T18:37:24.237Z" },
-    { url = "https://files.pythonhosted.org/packages/14/c7/ca723101509b518797fedc2fdf79ba57f886b4aca8a7d31857ba3ee8281f/markupsafe-3.0.3-cp314-cp314t-musllinux_1_2_x86_64.whl", hash = "sha256:5678211cb9333a6468fb8d8be0305520aa073f50d17f089b5b4b477ea6e67fdc", size = 23672, upload-time = "2025-09-27T18:37:25.271Z" },
-    { url = "https://files.pythonhosted.org/packages/fb/df/5bd7a48c256faecd1d36edc13133e51397e41b73bb77e1a69deab746ebac/markupsafe-3.0.3-cp314-cp314t-win32.whl", hash = "sha256:915c04ba3851909ce68ccc2b8e2cd691618c4dc4c4232fb7982bca3f41fd8c3d", size = 14819, upload-time = "2025-09-27T18:37:26.285Z" },
-    { url = "https://files.pythonhosted.org/packages/1a/8a/0402ba61a2f16038b48b39bccca271134be00c5c9f0f623208399333c448/markupsafe-3.0.3-cp314-cp314t-win_amd64.whl", hash = "sha256:4faffd047e07c38848ce017e8725090413cd80cbc23d86e55c587bf979e579c9", size = 15426, upload-time = "2025-09-27T18:37:27.316Z" },
-    { url = "https://files.pythonhosted.org/packages/70/bc/6f1c2f612465f5fa89b95bead1f44dcb607670fd42891d8fdcd5d039f4f4/markupsafe-3.0.3-cp314-cp314t-win_arm64.whl", hash = "sha256:32001d6a8fc98c8cb5c947787c5d08b0a50663d139f1305bac5885d98d9b40fa", size = 14146, upload-time = "2025-09-27T18:37:28.327Z" },
-]
-
 [[package]]
 name = "mccabe"
 version = "0.7.0"
@@ -554,15 +317,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/b3/38/89ba8ad64ae25be8de66a6d463314cf1eb366222074cfda9ee839c56a4b4/mdurl-0.1.2-py3-none-any.whl", hash = "sha256:84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8", size = 9979, upload-time = "2022-08-14T12:40:09.779Z" },
 ]
 
-[[package]]
-name = "mpmath"
-version = "1.3.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/e0/47/dd32fa426cc72114383ac549964eecb20ecfd886d1e5ccf5340b55b02f57/mpmath-1.3.0.tar.gz", hash = "sha256:7a28eb2a9774d00c7bc92411c19a89209d5da7c4c9a9e227be8330a23a25b91f", size = 508106, upload-time = "2023-03-07T16:47:11.061Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/43/e3/7d92a15f894aa0c9c4b49b8ee9ac9850d6e63b03c9c32c0367a13ae62209/mpmath-1.3.0-py3-none-any.whl", hash = "sha256:a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c", size = 536198, upload-time = "2023-03-07T16:47:09.197Z" },
-]
-
 [[package]]
 name = "mypy"
 version = "2.1.0"
@@ -602,15 +356,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/79/7b/2c79738432f5c924bef5071f933bcc9efd0473bac3b4aa584a6f7c1c8df8/mypy_extensions-1.1.0-py3-none-any.whl", hash = "sha256:1be4cccdb0f2482337c4743e60421de3a356cd97508abadd57d47403e94f5505", size = 4963, upload-time = "2025-04-22T14:54:22.983Z" },
 ]
 
-[[package]]
-name = "narwhals"
-version = "2.22.1"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/62/3c/c4ef2164a71c1a63d7f1ae411c4082c5fa872405106db60a4b7114989ad7/narwhals-2.22.1.tar.gz", hash = "sha256:d62920805a0a43b7ff8b54b0c0d3142d796f8a9301836ada37e573d6a33cbcd9", size = 647493, upload-time = "2026-06-05T12:34:34.051Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/48/ca/36339329c4604adbcc99c899b7eb1ce1a555c499b6a6860757dc9bfed36d/narwhals-2.22.1-py3-none-any.whl", hash = "sha256:60567d774edf77db53906f89d9fbd164e66e56d66d388e1e6990f17ac33cfb53", size = 454815, upload-time = "2026-06-05T12:34:32.289Z" },
-]
-
 [[package]]
 name = "networkx"
 version = "3.6.1"
@@ -658,158 +403,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/43/bb/e1c71a4295b1b1d1393d50dbb4f2a36283c6859d9d3892e84f00ec5a91d5/numpy-2.4.6-cp314-cp314t-win_arm64.whl", hash = "sha256:0c9136e14ed34a9e343a31c533d78a9813a69a3148332bce5e9821cb2f996e66", size = 10565867, upload-time = "2026-05-18T23:36:47.114Z" },
 ]
 
-[[package]]
-name = "nvidia-cublas"
-version = "13.1.1.3"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "nvidia-cuda-nvrtc" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/a7/a1/0bd24ee8c8d03adac032fd2909426a00c88f8c57961b1277ded97f91119f/nvidia_cublas-13.1.1.3-py3-none-manylinux_2_27_aarch64.whl", hash = "sha256:b7a210458267ac818974c53038fbec2e969d5c99f305ab15c72522fa9f001dd5", size = 542848918, upload-time = "2026-04-08T18:46:22.985Z" },
-    { url = "https://files.pythonhosted.org/packages/3b/cd/154ca20c38269e05eff77c1464e6c1da89f50a6390b565e9d82e06bc11e1/nvidia_cublas-13.1.1.3-py3-none-manylinux_2_27_x86_64.whl", hash = "sha256:37936a16db8fe4ac1f065c2139360608a543a09275cb1a1af612e08cfa065436", size = 423138758, upload-time = "2026-04-08T18:46:58.655Z" },
-]
-
-[[package]]
-name = "nvidia-cuda-cupti"
-version = "13.0.85"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/2a/2a/80353b103fc20ce05ef51e928daed4b6015db4aaa9162ed0997090fe2250/nvidia_cuda_cupti-13.0.85-py3-none-manylinux_2_25_aarch64.whl", hash = "sha256:796bd679890ee55fb14a94629b698b6db54bcfd833d391d5e94017dd9d7d3151", size = 10310827, upload-time = "2025-09-04T08:26:42.012Z" },
-    { url = "https://files.pythonhosted.org/packages/33/6d/737d164b4837a9bbd202f5ae3078975f0525a55730fe871d8ed4e3b952b0/nvidia_cuda_cupti-13.0.85-py3-none-manylinux_2_25_x86_64.whl", hash = "sha256:4eb01c08e859bf924d222250d2e8f8b8ff6d3db4721288cf35d14252a4d933c8", size = 10715597, upload-time = "2025-09-04T08:26:51.312Z" },
-]
-
-[[package]]
-name = "nvidia-cuda-nvrtc"
-version = "13.0.88"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/c3/68/483a78f5e8f31b08fb1bb671559968c0ca3a065ac7acabfc7cee55214fd6/nvidia_cuda_nvrtc-13.0.88-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl", hash = "sha256:ad9b6d2ead2435f11cbb6868809d2adeeee302e9bb94bcf0539c7a40d80e8575", size = 90215200, upload-time = "2025-09-04T08:28:44.204Z" },
-    { url = "https://files.pythonhosted.org/packages/b7/dc/6bb80850e0b7edd6588d560758f17e0550893a1feaf436807d64d2da040f/nvidia_cuda_nvrtc-13.0.88-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:d27f20a0ca67a4bb34268a5e951033496c5b74870b868bacd046b1b8e0c3267b", size = 43015449, upload-time = "2025-09-04T08:28:20.239Z" },
-]
-
-[[package]]
-name = "nvidia-cuda-runtime"
-version = "13.0.96"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/87/4f/17d7b9b8e285199c58ce28e31b5c5bbaa4d8271af06a89b6405258245de2/nvidia_cuda_runtime-13.0.96-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:ef9bcbe90493a2b9d810e43d249adb3d02e98dd30200d86607d8d02687c43f55", size = 2261060, upload-time = "2025-10-09T08:55:15.78Z" },
-    { url = "https://files.pythonhosted.org/packages/2e/24/d1558f3b68b1d26e706813b1d10aa1d785e4698c425af8db8edc3dced472/nvidia_cuda_runtime-13.0.96-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:7f82250d7782aa23b6cfe765ecc7db554bd3c2870c43f3d1821f1d18aebf0548", size = 2243632, upload-time = "2025-10-09T08:55:36.117Z" },
-]
-
-[[package]]
-name = "nvidia-cudnn-cu13"
-version = "9.20.0.48"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "nvidia-cublas" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/56/c5/83384d846b2fd17c44bd499b36c75a45ed4f095fbbb2252294e89cea5c5c/nvidia_cudnn_cu13-9.20.0.48-py3-none-manylinux_2_27_aarch64.whl", hash = "sha256:e31454ae00094b0c55319d9d15b6fa2fc50a9e1c0f5c8c80fb75258234e731e1", size = 444574296, upload-time = "2026-03-09T19:28:27.751Z" },
-    { url = "https://files.pythonhosted.org/packages/6e/5e/edb9c0ae051602c3ccaffe424256463636d639e27d7f302dde9975ef9e7a/nvidia_cudnn_cu13-9.20.0.48-py3-none-manylinux_2_27_x86_64.whl", hash = "sha256:0c45dd8eeb50b603f07995b1b300c62ffe6a1980482b82b3bcf94a4ca9d49304", size = 366173588, upload-time = "2026-03-09T19:29:34.474Z" },
-]
-
-[[package]]
-name = "nvidia-cufft"
-version = "12.0.0.61"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "nvidia-nvjitlink" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/8b/ae/f417a75c0259e85c1d2f83ca4e960289a5f814ed0cea74d18c353d3e989d/nvidia_cufft-12.0.0.61-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:2708c852ef8cd89d1d2068bdbece0aa188813a0c934db3779b9b1faa8442e5f5", size = 214053554, upload-time = "2025-09-04T08:31:38.196Z" },
-    { url = "https://files.pythonhosted.org/packages/a8/2f/7b57e29836ea8714f81e9898409196f47d772d5ddedddf1592eadb8ab743/nvidia_cufft-12.0.0.61-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:6c44f692dce8fd5ffd3e3df134b6cdb9c2f72d99cf40b62c32dde45eea9ddad3", size = 214085489, upload-time = "2025-09-04T08:31:56.044Z" },
-]
-
-[[package]]
-name = "nvidia-cufile"
-version = "1.15.1.6"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/3f/70/4f193de89a48b71714e74602ee14d04e4019ad36a5a9f20c425776e72cd6/nvidia_cufile-1.15.1.6-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:08a3ecefae5a01c7f5117351c64f17c7c62efa5fffdbe24fc7d298da19cd0b44", size = 1223672, upload-time = "2025-09-04T08:32:22.779Z" },
-    { url = "https://files.pythonhosted.org/packages/ab/73/cc4a14c9813a8a0d509417cf5f4bdaba76e924d58beb9864f5a7baceefbf/nvidia_cufile-1.15.1.6-py3-none-manylinux_2_27_aarch64.whl", hash = "sha256:bdc0deedc61f548bddf7733bdc216456c2fdb101d020e1ab4b88d232d5e2f6d1", size = 1136992, upload-time = "2025-09-04T08:32:14.119Z" },
-]
-
-[[package]]
-name = "nvidia-curand"
-version = "10.4.0.35"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/1e/72/7c2ae24fb6b63a32e6ae5d241cc65263ea18d08802aaae087d9f013335a2/nvidia_curand-10.4.0.35-py3-none-manylinux_2_27_aarch64.whl", hash = "sha256:133df5a7509c3e292aaa2b477afd0194f06ce4ea24d714d616ff36439cee349a", size = 61962106, upload-time = "2025-08-04T10:21:41.128Z" },
-    { url = "https://files.pythonhosted.org/packages/a5/9f/be0a41ca4a4917abf5cb9ae0daff1a6060cc5de950aec0396de9f3b52bc5/nvidia_curand-10.4.0.35-py3-none-manylinux_2_27_x86_64.whl", hash = "sha256:1aee33a5da6e1db083fe2b90082def8915f30f3248d5896bcec36a579d941bfc", size = 59544258, upload-time = "2025-08-04T10:22:03.992Z" },
-]
-
-[[package]]
-name = "nvidia-cusolver"
-version = "12.0.4.66"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "nvidia-cublas" },
-    { name = "nvidia-cusparse" },
-    { name = "nvidia-nvjitlink" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/c8/c3/b30c9e935fc01e3da443ec0116ed1b2a009bb867f5324d3f2d7e533e776b/nvidia_cusolver-12.0.4.66-py3-none-manylinux_2_27_aarch64.whl", hash = "sha256:02c2457eaa9e39de20f880f4bd8820e6a1cfb9f9a34f820eb12a155aa5bc92d2", size = 223467760, upload-time = "2025-09-04T08:33:04.222Z" },
-    { url = "https://files.pythonhosted.org/packages/5f/67/cba3777620cdacb99102da4042883709c41c709f4b6323c10781a9c3aa34/nvidia_cusolver-12.0.4.66-py3-none-manylinux_2_27_x86_64.whl", hash = "sha256:0a759da5dea5c0ea10fd307de75cdeb59e7ea4fcb8add0924859b944babf1112", size = 200941980, upload-time = "2025-09-04T08:33:22.767Z" },
-]
-
-[[package]]
-name = "nvidia-cusparse"
-version = "12.6.3.3"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "nvidia-nvjitlink" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/f8/94/5c26f33738ae35276672f12615a64bd008ed5be6d1ebcb23579285d960a9/nvidia_cusparse-12.6.3.3-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:80bcc4662f23f1054ee334a15c72b8940402975e0eab63178fc7e670aa59472c", size = 162155568, upload-time = "2025-09-04T08:33:42.864Z" },
-    { url = "https://files.pythonhosted.org/packages/fa/18/623c77619c31d62efd55302939756966f3ecc8d724a14dab2b75f1508850/nvidia_cusparse-12.6.3.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:2b3c89c88d01ee0e477cb7f82ef60a11a4bcd57b6b87c33f789350b59759360b", size = 145942937, upload-time = "2025-09-04T08:33:58.029Z" },
-]
-
-[[package]]
-name = "nvidia-cusparselt-cu13"
-version = "0.8.1"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/46/e1/cdc1797eadf82d3a9a575a19b33fdc871a97edbec42c00b5b5e914f4aff4/nvidia_cusparselt_cu13-0.8.1-py3-none-manylinux2014_aarch64.whl", hash = "sha256:4dca476c50bf4780d46cd0bfbd82e2bc10a08e4fef7950917ce8d7578d22a23f", size = 221051344, upload-time = "2025-09-05T18:49:51.289Z" },
-    { url = "https://files.pythonhosted.org/packages/34/7d/2661f2fb3ac4302f3a246f5fc030213ac60c1fe0bce84f9783dbd831dbb7/nvidia_cusparselt_cu13-0.8.1-py3-none-manylinux2014_x86_64.whl", hash = "sha256:786ce87568c303fadb5afcc7102d454cd3040d75f6f8626f5db460d1871f4dd0", size = 170148586, upload-time = "2025-09-05T18:50:50.248Z" },
-]
-
-[[package]]
-name = "nvidia-nccl-cu13"
-version = "2.29.7"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/72/0d/daf50d44177ee0cbc7ff0a0c91eb5ff676c82be42f9a970bc7597f440c3a/nvidia_nccl_cu13-2.29.7-py3-none-manylinux_2_18_aarch64.whl", hash = "sha256:674a12383e3c38a1bcccae7d4f3633b37852230b6047883cb2f4c2d1b36d9bf5", size = 206014712, upload-time = "2026-03-03T05:34:20.843Z" },
-    { url = "https://files.pythonhosted.org/packages/67/f4/58e4e91b6919367c7aafb8e36fce9aad1a3047e536bf7e2fd560927d3a4c/nvidia_nccl_cu13-2.29.7-py3-none-manylinux_2_18_x86_64.whl", hash = "sha256:edd81538446786ec3b73972543e53bb43bcaf0bfc8ef76cb679fcc390ffe136d", size = 205976000, upload-time = "2026-03-03T05:36:24.472Z" },
-]
-
-[[package]]
-name = "nvidia-nvjitlink"
-version = "13.0.88"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/56/7a/123e033aaff487c77107195fa5a2b8686795ca537935a24efae476c41f05/nvidia_nvjitlink-13.0.88-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl", hash = "sha256:13a74f429e23b921c1109976abefacc69835f2f433ebd323d3946e11d804e47b", size = 40713933, upload-time = "2025-09-04T08:35:43.553Z" },
-    { url = "https://files.pythonhosted.org/packages/ab/2c/93c5250e64df4f894f1cbb397c6fd71f79813f9fd79d7cd61de3f97b3c2d/nvidia_nvjitlink-13.0.88-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:e931536ccc7d467a98ba1d8b89ff7fa7f1fa3b13f2b0069118cd7f47bff07d0c", size = 38768748, upload-time = "2025-09-04T08:35:20.008Z" },
-]
-
-[[package]]
-name = "nvidia-nvshmem-cu13"
-version = "3.4.5"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/dc/0f/05cc9c720236dcd2db9c1ab97fff629e96821be2e63103569da0c9b72f19/nvidia_nvshmem_cu13-3.4.5-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:6dc2a197f38e5d0376ad52cd1a2a3617d3cdc150fd5966f4aee9bcebb1d68fe9", size = 60215947, upload-time = "2025-09-06T00:32:20.022Z" },
-    { url = "https://files.pythonhosted.org/packages/3c/35/a9bf80a609e74e3b000fef598933235c908fcefcef9026042b8e6dfde2a9/nvidia_nvshmem_cu13-3.4.5-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl", hash = "sha256:290f0a2ee94c9f3687a02502f3b9299a9f9fe826e6d0287ee18482e78d495b80", size = 60412546, upload-time = "2025-09-06T00:32:41.564Z" },
-]
-
-[[package]]
-name = "nvidia-nvtx"
-version = "13.0.85"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/c2/f3/d86c845465a2723ad7e1e5c36dcd75ddb82898b3f53be47ebd429fb2fa5d/nvidia_nvtx-13.0.85-py3-none-manylinux1_x86_64.manylinux_2_5_x86_64.whl", hash = "sha256:4936d1d6780fbe68db454f5e72a42ff64d1fd6397df9f363ae786930fd5c1cd4", size = 148047, upload-time = "2025-09-04T08:29:01.761Z" },
-    { url = "https://files.pythonhosted.org/packages/a8/64/3708a90d1ebe202ffdeb7185f878a3c84d15c2b2c31858da2ce0583e2def/nvidia_nvtx-13.0.85-py3-none-manylinux2014_aarch64.manylinux_2_17_aarch64.whl", hash = "sha256:cb7780edb6b14107373c835bf8b72e7a178bac7367e23da7acb108f973f157a6", size = 148878, upload-time = "2025-09-04T08:28:53.627Z" },
-]
-
 [[package]]
 name = "packaging"
 version = "26.2"
@@ -989,11 +582,6 @@ dependencies = [
     { name = "tomli-w" },
 ]
 
-[package.optional-dependencies]
-semantic = [
-    { name = "sentence-transformers" },
-]
-
 [package.dev-dependencies]
 dev = [
     { name = "detect-secrets" },
@@ -1029,7 +617,6 @@ requires-dist = [
     { name = "beartype", specifier = ">=0.22.9" },
     { name = "pylint", specifier = ">=4.0.6" },
     { name = "pytest", specifier = ">=9.1.0" },
-    { name = "sentence-transformers", marker = "extra == 'semantic'", specifier = ">=3.0.0" },
     { name = "structlog", specifier = ">=26.1.0" },
     { name = "tomli-w", specifier = ">=1.0" },
 ]
@@ -1103,46 +690,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/2c/58/ca301544e1fa93ed4f80d724bf5b194f6e4b945841c5bfd555878eea9fcb/referencing-0.37.0-py3-none-any.whl", hash = "sha256:381329a9f99628c9069361716891d34ad94af76e461dcb0335825aecc7692231", size = 26766, upload-time = "2025-10-13T15:30:47.625Z" },
 ]
 
-[[package]]
-name = "regex"
-version = "2026.5.9"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/dc/0e/49aee608ad09480e7fd276898c99ec6192985fa331abe4eb3a986094490b/regex-2026.5.9.tar.gz", hash = "sha256:a8234aa23ec39894bfe4a3f1b85616a7032481964a13ac6fc9f10de4f6fca270", size = 416074, upload-time = "2026-05-09T23:15:19.37Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/13/3e/9c3cd292d8808b3645a2ce517e200179b6d0e903f176300bd8b542e14de5/regex-2026.5.9-cp314-cp314-macosx_10_13_universal2.whl", hash = "sha256:1bd7587a2948b4085195d5a3374eaf4a425dc3e55784c038175355ecf3bbbf8a", size = 490376, upload-time = "2026-05-09T23:14:09.64Z" },
-    { url = "https://files.pythonhosted.org/packages/60/70/d43ee8a2ca0a8b68d167f21658b85520ac0574617c7f320367c5047f7556/regex-2026.5.9-cp314-cp314-macosx_10_13_x86_64.whl", hash = "sha256:dea2e88e1cce4522496cce630e11e67b98b7076620bc4336c3f674bc21a375f4", size = 291964, upload-time = "2026-05-09T23:14:11.424Z" },
-    { url = "https://files.pythonhosted.org/packages/21/91/9d50b433828d8e74196904e168a43abf1e6e88b2a15d47ed742456720c37/regex-2026.5.9-cp314-cp314-macosx_11_0_arm64.whl", hash = "sha256:2099f7e7ff7b6aa3192312650a56e91cc091e49d50b04e4f6f8b6e28b3b27f1c", size = 289682, upload-time = "2026-05-09T23:14:13.123Z" },
-    { url = "https://files.pythonhosted.org/packages/3e/d2/b835e3cafbb9d977736912436259ff551d60919f7d7b3d37d46659c63564/regex-2026.5.9-cp314-cp314-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:ecd353045824e4477562a2ac718c25799cdaaa41f7aa925a806a8a3e6848a5b9", size = 796996, upload-time = "2026-05-09T23:14:14.923Z" },
-    { url = "https://files.pythonhosted.org/packages/2c/a6/9f992d00019166b9de01c546dd4549bc679f2a68df11b877740b0760b7c2/regex-2026.5.9-cp314-cp314-manylinux2014_ppc64le.manylinux_2_17_ppc64le.manylinux_2_28_ppc64le.whl", hash = "sha256:65c8c8c37377794bd5b2f3ebe51919042bf17aec802e23c833d89782ed0c78af", size = 866089, upload-time = "2026-05-09T23:14:17.757Z" },
-    { url = "https://files.pythonhosted.org/packages/e0/08/4d32af657e049b19cb62b02e46e38fe1518797bfb2203ee93a510b21b0dc/regex-2026.5.9-cp314-cp314-manylinux2014_s390x.manylinux_2_17_s390x.manylinux_2_28_s390x.whl", hash = "sha256:5b73ab8afcf66c622db143d1c6fda4e58e4d537ee4f125229ad47b1ab80f34c0", size = 911530, upload-time = "2026-05-09T23:14:20.353Z" },
-    { url = "https://files.pythonhosted.org/packages/d9/27/2af43dd1dc201d1fecefda64a45f4ad0995855b92724f795a777b402ee69/regex-2026.5.9-cp314-cp314-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:0de5cf193997384ed2ca6f1cd4f78055b255d93d82d5a8cd6ba0d11c10b167e4", size = 800643, upload-time = "2026-05-09T23:14:22.265Z" },
-    { url = "https://files.pythonhosted.org/packages/a4/dd/23a249047013b5321d4a60c4d2437462086f601b061776a525e5fba2a59f/regex-2026.5.9-cp314-cp314-manylinux_2_31_riscv64.manylinux_2_39_riscv64.whl", hash = "sha256:d641a8c9a61618047796d572a39a79b26167b0411d2c3031937b2fe2d081e2cf", size = 777223, upload-time = "2026-05-09T23:14:24.179Z" },
-    { url = "https://files.pythonhosted.org/packages/94/6a/e85ed9538cd19586d0465076a4578a12e093ce776d15f3f8ce92733a8dd6/regex-2026.5.9-cp314-cp314-musllinux_1_2_aarch64.whl", hash = "sha256:24b2355ef5cc9aa5b8f07d17704face1c166fdcc2290fa7bd6e6c925655a8346", size = 785760, upload-time = "2026-05-09T23:14:26.065Z" },
-    { url = "https://files.pythonhosted.org/packages/2a/c4/f25473209438638e947c55f9156fd8f236f74169229028cc99116380868e/regex-2026.5.9-cp314-cp314-musllinux_1_2_ppc64le.whl", hash = "sha256:a24852d3c29ad9e47593593d8a247c44ccc3d0548ef12c822d6ed0810affe676", size = 860891, upload-time = "2026-05-09T23:14:28.17Z" },
-    { url = "https://files.pythonhosted.org/packages/f9/f7/f4f86e3c74419c37370e91f150ae0c2ef7d34b2e0e4cdd5da046a02e4022/regex-2026.5.9-cp314-cp314-musllinux_1_2_riscv64.whl", hash = "sha256:916714069da19329ef7de197dcbc77bb3104145c7c2c864dbfbe318f46b88b14", size = 765891, upload-time = "2026-05-09T23:14:30.06Z" },
-    { url = "https://files.pythonhosted.org/packages/26/70/704d8e13765939146b1cd0ef4e2feb71d7929727d2290f026eed10095955/regex-2026.5.9-cp314-cp314-musllinux_1_2_s390x.whl", hash = "sha256:fa411799ca8da32a8d38d020a88faa5b6f91657d284761352940ecf9f7c3bbdd", size = 851380, upload-time = "2026-05-09T23:14:32.123Z" },
-    { url = "https://files.pythonhosted.org/packages/26/29/1a13582a8460038edc38e49f64ceb0dd7c60f5caba77571f4bf6601965d9/regex-2026.5.9-cp314-cp314-musllinux_1_2_x86_64.whl", hash = "sha256:1e6da47d679b7010ef27556b6e0f99771b744936db1792a10ceac6547ae1503e", size = 789350, upload-time = "2026-05-09T23:14:34.799Z" },
-    { url = "https://files.pythonhosted.org/packages/73/56/3dcafe34fc72e271d62ad9a291801e88a1457bb251c132f15fcc2e5aad1a/regex-2026.5.9-cp314-cp314-win32.whl", hash = "sha256:98bd73080e8756255137e1bd3f3f00295bbc5aa383c0e0f973920e9134d7c4ad", size = 272130, upload-time = "2026-05-09T23:14:36.729Z" },
-    { url = "https://files.pythonhosted.org/packages/d0/9c/02eebf0be95efe416c664db7fb8b6b05b7a0b06a7544f2884f2558b0526f/regex-2026.5.9-cp314-cp314-win_amd64.whl", hash = "sha256:ff8d372ac2acdc048d1c19916f27ee61bc5722728458ba6ca5052f2c72d51763", size = 280999, upload-time = "2026-05-09T23:14:39.126Z" },
-    { url = "https://files.pythonhosted.org/packages/70/5a/1dd1abee76cb7a846a0bcf42fdc87e5720c3c33c24f3e37814310a513d9f/regex-2026.5.9-cp314-cp314-win_arm64.whl", hash = "sha256:e1d93bf647916292e8edcec150c07ddf3dc50179ccaf770c04a7f9e452155372", size = 273500, upload-time = "2026-05-09T23:14:41.059Z" },
-    { url = "https://files.pythonhosted.org/packages/86/c1/c5f619b0057a7965cb78ec559c1d7a45ce8c99a35bea95483d64959a93d9/regex-2026.5.9-cp314-cp314t-macosx_10_13_universal2.whl", hash = "sha256:83d0ee4a57d1c87cb549e195ec300b8f0ec3a82eba66d835e4e2ed8634fe4499", size = 494269, upload-time = "2026-05-09T23:14:42.869Z" },
-    { url = "https://files.pythonhosted.org/packages/05/2c/5d01f1aee33de4bbe60c8452945bfc8477ca7c5ae4450f6bfe711036cb36/regex-2026.5.9-cp314-cp314t-macosx_10_13_x86_64.whl", hash = "sha256:d3d7eb5c9a7f6df82ed3cfac9beb93882a5cbcb5b8b157b56cb2b3b276574ac1", size = 293954, upload-time = "2026-05-09T23:14:44.822Z" },
-    { url = "https://files.pythonhosted.org/packages/7a/fe/e8988b2ae2108c6ef71bd4aa8d87fbe257976dd0810e826cd75f701c68b6/regex-2026.5.9-cp314-cp314t-macosx_11_0_arm64.whl", hash = "sha256:075160bf16658e16d35233300b8453aac25de4cbea808d22348b6979668e924d", size = 292405, upload-time = "2026-05-09T23:14:47.211Z" },
-    { url = "https://files.pythonhosted.org/packages/79/34/d2b0937faa7859263f7f0a3c6b103a1296306be6952dc173d0154e9a2f49/regex-2026.5.9-cp314-cp314t-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:45375819235558a4ff1c4971dc32881f022613abdb180128f5cb4768c1765a1c", size = 811855, upload-time = "2026-05-09T23:14:49.21Z" },
-    { url = "https://files.pythonhosted.org/packages/80/fe/daf53a47457a8486db66c66c01ceb9c2303eecee3f87197f1e77eb1a736d/regex-2026.5.9-cp314-cp314t-manylinux2014_ppc64le.manylinux_2_17_ppc64le.manylinux_2_28_ppc64le.whl", hash = "sha256:ead4b163ac30a29574510cd4b3e2e985ac5290c05fc7095557d6a5f403fc31b5", size = 871189, upload-time = "2026-05-09T23:14:51.555Z" },
-    { url = "https://files.pythonhosted.org/packages/1c/75/058fc4470cbfbf57d800aff1a0022b929a3f9fa553ee10a0cdf2070eb31f/regex-2026.5.9-cp314-cp314t-manylinux2014_s390x.manylinux_2_17_s390x.manylinux_2_28_s390x.whl", hash = "sha256:8c6e4218fbdfbcd4f6c19efca40930d24a621bf4b48cb76bc6640543bd28ef20", size = 917485, upload-time = "2026-05-09T23:14:53.633Z" },
-    { url = "https://files.pythonhosted.org/packages/88/e7/179cfda3a28bc843b5c6cfe7f79f23489c791ed95f151083803660878432/regex-2026.5.9-cp314-cp314t-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:6351571c8a42b505eb555c0dc47d740d0fb66977dc142919eea6f4325b7c56a0", size = 816369, upload-time = "2026-05-09T23:14:56.198Z" },
-    { url = "https://files.pythonhosted.org/packages/41/90/6f0cc422071688266d344fca8462d787cba0a2c144acb25721f9a61ec265/regex-2026.5.9-cp314-cp314t-manylinux_2_31_riscv64.manylinux_2_39_riscv64.whl", hash = "sha256:002205cafd2a9e78c6290c7d1df277bf3277b3b7a30e0b4bb0dac2e2e3f7cb2d", size = 785869, upload-time = "2026-05-09T23:14:58.602Z" },
-    { url = "https://files.pythonhosted.org/packages/02/67/a31f1760f09c27b251ef39e9beb541f462cf977381d067faa764c2c0e393/regex-2026.5.9-cp314-cp314t-musllinux_1_2_aarch64.whl", hash = "sha256:8abd33fef90b2a9efac5557d6033ca82d1195ed3a15fea5af15ba7b463c6a63b", size = 801427, upload-time = "2026-05-09T23:15:00.642Z" },
-    { url = "https://files.pythonhosted.org/packages/e3/c4/1a80654597b6bc1e1ea0494824c31200e8a956abe290afae9b19a166a148/regex-2026.5.9-cp314-cp314t-musllinux_1_2_ppc64le.whl", hash = "sha256:31037c82eccb44b7ea2e9e221d7c01429430e989a1f4b91ea5a855f6017b509a", size = 866482, upload-time = "2026-05-09T23:15:03.384Z" },
-    { url = "https://files.pythonhosted.org/packages/d1/11/960724e06482c08466ff5611e242e86f80062949cdf6b4b9cc317b9dd93d/regex-2026.5.9-cp314-cp314t-musllinux_1_2_riscv64.whl", hash = "sha256:5604dfd046dc37eca90250fc3be938b076c8059fa772ac0ed6f499b0f0fb0415", size = 773022, upload-time = "2026-05-09T23:15:05.625Z" },
-    { url = "https://files.pythonhosted.org/packages/50/a8/a9979c3e7918280e93159ebcab5ef1a65116dd4f3bd6091be0eae4a126e8/regex-2026.5.9-cp314-cp314t-musllinux_1_2_s390x.whl", hash = "sha256:0e1b1b4e496afbb24f4a62aba855ee4f88f25578927697b340702e48c9ee6bc2", size = 856642, upload-time = "2026-05-09T23:15:07.966Z" },
-    { url = "https://files.pythonhosted.org/packages/fe/d4/a9b732f2f0072c0ab12227483abb24fffcb9f73f8a2b203df0a6d0434735/regex-2026.5.9-cp314-cp314t-musllinux_1_2_x86_64.whl", hash = "sha256:be3372b9df6ddecff6486d37e19095a7b4973137caf5512407a89f4455361f41", size = 803552, upload-time = "2026-05-09T23:15:10.215Z" },
-    { url = "https://files.pythonhosted.org/packages/d5/fe/1b3113817447a1d4155e4ac76d2e072f42c0bcba2f43fa8a0e756ea2cd91/regex-2026.5.9-cp314-cp314t-win32.whl", hash = "sha256:3ddd90103f9e5c471c49c7852ecc1fe27c7e45eb99e977aefe7caa4e779f4f58", size = 275746, upload-time = "2026-05-09T23:15:12.609Z" },
-    { url = "https://files.pythonhosted.org/packages/92/73/93d42045302636c91f2e5ef588b65b84b01428f28ec77de256b1dfdfbe5c/regex-2026.5.9-cp314-cp314t-win_amd64.whl", hash = "sha256:ca518ed29c46eecba6010b15f1b9a479314d2de409536e71b6a13aa04e3b8a77", size = 285685, upload-time = "2026-05-09T23:15:15.086Z" },
-    { url = "https://files.pythonhosted.org/packages/da/80/35b4c33c804a165a7f55289afda3ea9e3eb6d15800341a2d66455c0f1f30/regex-2026.5.9-cp314-cp314t-win_arm64.whl", hash = "sha256:5e41809d2683fcde7d5a8c87a6567ba1fb1ce0de9f31bff578de00a4b2d76daa", size = 275713, upload-time = "2026-05-09T23:15:16.98Z" },
-]
-
 [[package]]
 name = "requests"
 version = "2.34.2"
@@ -1277,125 +824,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/a3/ec/571fb815e9f06e5b2d3d7d84caaaf39aa3841ea0d30c9f85fad6b1515e3f/rumdl-0.2.16-py3-none-win_amd64.whl", hash = "sha256:cc2b1408ac98dbea6681507da4552cc2237d82b705ac48f89b57aaa632c9ed62", size = 5873130, upload-time = "2026-06-13T10:05:58.676Z" },
 ]
 
-[[package]]
-name = "safetensors"
-version = "0.8.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/45/06/f955dbbb1859e3bd23c8ac6141af5106e7ad5fedec4a3a6e3d60f94b7001/safetensors-0.8.0.tar.gz", hash = "sha256:fabaf3e0f18a6618d9b36560682562157f77c2b71fcffc7b432be2baed9d753d", size = 325846, upload-time = "2026-06-09T07:52:25.563Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/39/a0/f718cda65b05407d228f97602cf60dca269c979867aa5beb25410de26cd3/safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl", hash = "sha256:c554f85858e05226d3c2828e32395e677434685d6d94594a41643361c5e837f0", size = 473568, upload-time = "2026-06-09T07:52:18.829Z" },
-    { url = "https://files.pythonhosted.org/packages/f5/b1/fa7c600e7dceae12e9606c7578cbc9ff1e1ed55844883ee5c92205e86226/safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl", hash = "sha256:c80201d22cbf405b80647a60ada77bba06c8fba2da2743ba1e89cdcc39a81f25", size = 484562, upload-time = "2026-06-09T07:52:17.518Z" },
-    { url = "https://files.pythonhosted.org/packages/09/7d/65a7de0af421317bb36a067241e4235fff194eed60b961ed6d3f59a3fc60/safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl", hash = "sha256:7a46e5ff292c356d6991e60942ba7f79817682d3a2cef0702136448cb9c4d235", size = 502844, upload-time = "2026-06-09T07:52:07.624Z" },
-    { url = "https://files.pythonhosted.org/packages/91/4f/3175c9d75634e0e0dda0082794193521035edd7c70a6f212bf33ca06ddf4/safetensors-0.8.0-cp310-abi3-manylinux_2_17_armv7l.manylinux2014_armv7l.whl", hash = "sha256:4124502b78f03534117c848f87a39b8f31e577b15eff423bf8bfb95f2a8c30d0", size = 511823, upload-time = "2026-06-09T07:52:09.565Z" },
-    { url = "https://files.pythonhosted.org/packages/20/87/846c289e7aa2299eff406335717cf43ce8777194ece8aad75772e0411615/safetensors-0.8.0-cp310-abi3-manylinux_2_17_ppc64le.manylinux2014_ppc64le.whl", hash = "sha256:7bc0a787ba8a35be368ee3574edfa2b1ad389eebd0a72e482ae275490e3f6c98", size = 633461, upload-time = "2026-06-09T07:52:11.128Z" },
-    { url = "https://files.pythonhosted.org/packages/76/22/8d64d9df2c45d5ded401df889d0ad90882804ca172d79ec4f0df8f727fe0/safetensors-0.8.0-cp310-abi3-manylinux_2_17_s390x.manylinux2014_s390x.whl", hash = "sha256:040070828e36dc8e122178bbbd5830ff9e97920affb84cbe0f46442497bed358", size = 545148, upload-time = "2026-06-09T07:52:13.603Z" },
-    { url = "https://files.pythonhosted.org/packages/28/50/f203ff3a3ddfe19308efc83c5a3a29ed02bf786732ec35e68bf9162f3365/safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl", hash = "sha256:fd6f3f93c9a0a7cc2788ee63fb763353d4bd2e89b0751bc78fcf7dda00bea774", size = 516040, upload-time = "2026-06-09T07:52:16.29Z" },
-    { url = "https://files.pythonhosted.org/packages/46/fb/cdaed17ceb2948784fd9c36b6fd3e951b608547cea81a48e8ee6f8cfdfcb/safetensors-0.8.0-cp310-abi3-manylinux_2_31_riscv64.whl", hash = "sha256:fcdd41ec4628fee5799f807c73c353629130fbd942aa23d83c623dd6c9d52d78", size = 513832, upload-time = "2026-06-09T07:52:12.37Z" },
-    { url = "https://files.pythonhosted.org/packages/0d/49/1e15de264dcc3b77943d2d0c56a95809956883b1c2d6d585c792523f180b/safetensors-0.8.0-cp310-abi3-manylinux_2_5_i686.manylinux1_i686.whl", hash = "sha256:8e9f537aa183a38ace122d27303dcd986b26bd2a7591f9181d7f0c396f4677ca", size = 559930, upload-time = "2026-06-09T07:52:14.743Z" },
-    { url = "https://files.pythonhosted.org/packages/2a/43/bf38443278eab4b1be1fce2931e2b012ad9cb7df52ada751d0aab8f7659a/safetensors-0.8.0-cp310-abi3-musllinux_1_2_aarch64.whl", hash = "sha256:87eec7ffed2b809f05a398a8becb7d013f19f7837cd15d9748580d6cf30dbaf4", size = 678670, upload-time = "2026-06-09T07:52:20.032Z" },
-    { url = "https://files.pythonhosted.org/packages/72/e3/68cd3fa5b48488e84add63e04cb12f3bc28ae4638c06d4508c6e88823d0e/safetensors-0.8.0-cp310-abi3-musllinux_1_2_armv7l.whl", hash = "sha256:4a95ae2b05d7726d751da4ebf626a2ca782b706e101bd894c95bc2450b1cffcc", size = 786679, upload-time = "2026-06-09T07:52:21.322Z" },
-    { url = "https://files.pythonhosted.org/packages/29/4b/1c19c509d56e01f4fbb3d0a2e597450f6cc04d1d56cf52defb0a62dfd715/safetensors-0.8.0-cp310-abi3-musllinux_1_2_i686.whl", hash = "sha256:3ae091f16662658bdc019a4ff6cb4c085bb7d725eb5978b183ffd265863b6d2d", size = 765683, upload-time = "2026-06-09T07:52:22.594Z" },
-    { url = "https://files.pythonhosted.org/packages/27/43/41c1621732edd934d868a00d1b891584c892a7b62a9aab82ea5a0a5623ee/safetensors-0.8.0-cp310-abi3-musllinux_1_2_x86_64.whl", hash = "sha256:8e080062fcde23be189565e1c3305d16751a218ecf9412c8601e64204eb6f846", size = 722361, upload-time = "2026-06-09T07:52:23.924Z" },
-    { url = "https://files.pythonhosted.org/packages/8e/3f/73ccf82579412b4a71c4ca673f10b5f1f888d7cf5af7fe24f27d30307be4/safetensors-0.8.0-cp310-abi3-win32.whl", hash = "sha256:2ddf52eac562eda224f99acfa7889d02968c1fd59a5b011ae7d8137c37e9c02d", size = 342401, upload-time = "2026-06-09T07:52:28.895Z" },
-    { url = "https://files.pythonhosted.org/packages/1b/6d/3fba214c1e5e0f69991677ec3bc17023f0421776975e1de0c682dca475e2/safetensors-0.8.0-cp310-abi3-win_amd64.whl", hash = "sha256:096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f", size = 355540, upload-time = "2026-06-09T07:52:27.832Z" },
-    { url = "https://files.pythonhosted.org/packages/8d/fc/7eedc3510d97878876e32774eebbeb61c43f148a96e915c84229a3e967aa/safetensors-0.8.0-cp310-abi3-win_arm64.whl", hash = "sha256:f7838e5135a406ad3e02efdcb8cf2e5397d368b0154537c4fec682dbc544d452", size = 340500, upload-time = "2026-06-09T07:52:26.745Z" },
-]
-
-[[package]]
-name = "scikit-learn"
-version = "1.9.0"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "joblib" },
-    { name = "narwhals" },
-    { name = "numpy" },
-    { name = "scipy" },
-    { name = "threadpoolctl" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/fa/6f/37092bdb25f712817231799fc5674d8e704066a8a70c1d2d40517e18b4ab/scikit_learn-1.9.0.tar.gz", hash = "sha256:8833266989d3a5110178a9fae30783675460724d0e1efb13b14901d2c660c557", size = 7750767, upload-time = "2026-06-02T11:54:32.706Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/f4/7d/c9a35cf59b20a86fec24d306f1547b78dec194b08d367ce2a3e4854169d9/scikit_learn-1.9.0-cp314-cp314-macosx_10_15_x86_64.whl", hash = "sha256:9656acd4e93f74e0b66c8a36c88830a99252dfa900044d36bc2212ae89a47162", size = 8713289, upload-time = "2026-06-02T11:53:58.788Z" },
-    { url = "https://files.pythonhosted.org/packages/3c/a7/552a7821597c632b907f7bfe8f36f9f572777af8ef8a48353041cf8e091a/scikit_learn-1.9.0-cp314-cp314-macosx_12_0_arm64.whl", hash = "sha256:24360002ae845e7866522b0a5bbf690802e7bc388cac8663502e78aa98598aa2", size = 8245141, upload-time = "2026-06-02T11:54:01.694Z" },
-    { url = "https://files.pythonhosted.org/packages/7d/79/f4a0c4fe9711154cddabf913471153af79056382ddc612cfe5ee0ff4b72e/scikit_learn-1.9.0-cp314-cp314-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:5162ad10a418c8a282dde04c9aa06965de3e9a65f33c1440c0ae69bb1a09d913", size = 8847671, upload-time = "2026-06-02T11:54:04.448Z" },
-    { url = "https://files.pythonhosted.org/packages/f0/af/4d72d9e475ac83719160c662619e4bf7b95c19507cd582e7d0167a3c3dae/scikit_learn-1.9.0-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:1fea2cc5677ab49d6f5bade978c866da44957b712d92e9635e8b4f723013c3cb", size = 9118104, upload-time = "2026-06-02T11:54:07.205Z" },
-    { url = "https://files.pythonhosted.org/packages/a2/d5/6a58eea2cb9abbb9b3f2bb8b2cfb3243d1152d69f442d256c7af71304769/scikit_learn-1.9.0-cp314-cp314-win_amd64.whl", hash = "sha256:64fa347efc1c839c487433e40c5144d38c336e8a2b59c81aa8660373945c2673", size = 8290674, upload-time = "2026-06-02T11:54:10.087Z" },
-    { url = "https://files.pythonhosted.org/packages/65/5b/d4c879cf358f1187141cf90ced473f087183489090244f50c124a2ee478b/scikit_learn-1.9.0-cp314-cp314-win_arm64.whl", hash = "sha256:1b944b6db288f6b926e3650026ddafb988929de95d11fc2cc5fa117773c9ba42", size = 7978807, upload-time = "2026-06-02T11:54:12.769Z" },
-    { url = "https://files.pythonhosted.org/packages/8a/43/bfae3121ec67ae09150d453c442c7c1cc166e9aefe056e6ab3b7728a5cfc/scikit_learn-1.9.0-cp314-cp314t-macosx_10_15_x86_64.whl", hash = "sha256:4ccacf04ca5f4b492158a5f28afe0ace43f81b2571e4b9a66d34848b46128949", size = 9031941, upload-time = "2026-06-02T11:54:15.436Z" },
-    { url = "https://files.pythonhosted.org/packages/75/b0/20a4546eb17f3b25d3c66df15810411c14ed5065bcfab50b53c96fb627b2/scikit_learn-1.9.0-cp314-cp314t-macosx_12_0_arm64.whl", hash = "sha256:ee1a8db2c18c08e34c7412d4b10be1cac214cd4ea7dc9715a6a327eb49a37c96", size = 8613528, upload-time = "2026-06-02T11:54:18.842Z" },
-    { url = "https://files.pythonhosted.org/packages/18/3c/e440e039bb82cd19004edaaad00acbde0fb9b461083c3ecf37941c557312/scikit_learn-1.9.0-cp314-cp314t-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:147e9329ef0e39f75d4cffa02b2aa48d827832684926cd5210d9a2cb5c57246b", size = 8855050, upload-time = "2026-06-02T11:54:21.699Z" },
-    { url = "https://files.pythonhosted.org/packages/43/26/b341b8dab5998da6270a3a42c2152c578501354d36f944b5856757035ef8/scikit_learn-1.9.0-cp314-cp314t-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:5bad8f8b9950321b54c965fdcbac6c6c55e79e16646b49977bcf3668d3870a1a", size = 9097190, upload-time = "2026-06-02T11:54:24.454Z" },
-    { url = "https://files.pythonhosted.org/packages/fb/de/b650b4d69b84468cfa2e28a3ff7b8103743029e6446ce1a97fe060ef688c/scikit_learn-1.9.0-cp314-cp314t-win_amd64.whl", hash = "sha256:78fc56eafd4edb9575d2d8950d1dd152061abb573341a1cb7e099fc40f6c6666", size = 8963204, upload-time = "2026-06-02T11:54:27.428Z" },
-    { url = "https://files.pythonhosted.org/packages/ee/f3/ff83d76d7418112e5a61326443cdda87be3545dd8d6599c95b2481a4419e/scikit_learn-1.9.0-cp314-cp314t-win_arm64.whl", hash = "sha256:051075bda8b7aab87b1906ab3d4740a1e1224a19d7b3781a576736edc94e76aa", size = 8222661, upload-time = "2026-06-02T11:54:30.192Z" },
-]
-
-[[package]]
-name = "scipy"
-version = "1.18.0"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "numpy" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/a7/25/c2700dfaf6442b4effaa91af24ebce5dc9d31bb4a69706313aae70d72cd0/scipy-1.18.0.tar.gz", hash = "sha256:67b2ad2ad54c72ca6d04975a9b2df8c3638c34ddd5b28738e94fc2b57929d378", size = 30774447, upload-time = "2026-06-19T15:01:43.456Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/78/b5/915a19b3de2f7430062b509653563db1633ddbb6f021b06731521115d4e2/scipy-1.18.0-cp314-cp314-macosx_10_15_x86_64.whl", hash = "sha256:4c256ee70c0d1a8a2ace807e199ccd4e3f57037433842abb3fb36bc17eaa9578", size = 31036253, upload-time = "2026-06-19T15:00:43.216Z" },
-    { url = "https://files.pythonhosted.org/packages/d7/88/b72def7262e150d16be13fca37a96481138d624e700340bc3362a7588929/scipy-1.18.0-cp314-cp314-macosx_12_0_arm64.whl", hash = "sha256:2ef3abc54a4ffc53765374b0d5728532dfdd2585ed23f6b11c206a1f0b1b9af8", size = 28673758, upload-time = "2026-06-19T15:00:46.663Z" },
-    { url = "https://files.pythonhosted.org/packages/91/02/2e636a61a525632c373cf6a9c24442a3ffb79e364d38e98b32042964ac32/scipy-1.18.0-cp314-cp314-macosx_14_0_arm64.whl", hash = "sha256:f2a6af57bd9e4a75d70e4117e78a1bbee84f79ae3fbb6d0111005d6ebcc4cb8d", size = 20415514, upload-time = "2026-06-19T15:00:49.399Z" },
-    { url = "https://files.pythonhosted.org/packages/c9/b6/2135974442f6aba159d9d39d774a1c8cb19947016725d69fecc685df45bf/scipy-1.18.0-cp314-cp314-macosx_14_0_x86_64.whl", hash = "sha256:3f1ac564d3bf6c03d861d2cd87a1bea0da2887136f7fb1bf519c05a8971452d6", size = 23034398, upload-time = "2026-06-19T15:00:51.941Z" },
-    { url = "https://files.pythonhosted.org/packages/f6/e6/ba89ec5abf6ee9257c0d1ec985573f3ae32742c24bc03e016388a40b1b15/scipy-1.18.0-cp314-cp314-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:40395a5fcd1abee49a5c7aaa98c29db393eedc835138560a588c47ec16156690", size = 33998032, upload-time = "2026-06-19T15:00:54.838Z" },
-    { url = "https://files.pythonhosted.org/packages/7f/c4/bc41eb19b0fd0db868f4132920879019318d80cc522ad8f2bca4611af808/scipy-1.18.0-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:8ca01e8ae69f1b18e9a58d91afead31be3cef0dd905a10249dac559ee15460a0", size = 35283333, upload-time = "2026-06-19T15:00:58.152Z" },
-    { url = "https://files.pythonhosted.org/packages/53/a4/cbdeef6eb3830a8462a9d4ada814de5fc984345cc9ecf17cbec51a036f1e/scipy-1.18.0-cp314-cp314-musllinux_1_2_aarch64.whl", hash = "sha256:7a7f3b01647384dbc3a711e8c6778e0aabbe93959249fef5c7393396bcac0867", size = 35610216, upload-time = "2026-06-19T15:01:01.155Z" },
-    { url = "https://files.pythonhosted.org/packages/80/4d/b2b82502b65f661d1b789c1665dcdf315d5f12194e06fc0b37946294ebae/scipy-1.18.0-cp314-cp314-musllinux_1_2_x86_64.whl", hash = "sha256:6aa94e78ec192a30063a5e72e561c28af769dc311190b24fe91774eff1969709", size = 37418960, upload-time = "2026-06-19T15:01:04.155Z" },
-    { url = "https://files.pythonhosted.org/packages/93/3e/902d836831474b0ab5a37d16404f7bc5fafd9efba632890e271ba952635f/scipy-1.18.0-cp314-cp314-win_amd64.whl", hash = "sha256:2d8bbdc6c817f5b4006a54d799d4f5bab6f910193cbb9a1ff310833d4d270f61", size = 37288845, upload-time = "2026-06-19T15:01:07.822Z" },
-    { url = "https://files.pythonhosted.org/packages/b6/43/8d73b337a3bdb14daa0314f0434210747c02d79d729ce1777574a817dcf6/scipy-1.18.0-cp314-cp314-win_arm64.whl", hash = "sha256:18e9575f1569b2c54174e6159d32942e03731177f63dce7975f0a0c88d102f5b", size = 24988971, upload-time = "2026-06-19T15:01:11.076Z" },
-    { url = "https://files.pythonhosted.org/packages/b4/b4/f11918b0508a2787031a0499a03fbe3546f3bb5ca05d01038c45b278c09a/scipy-1.18.0-cp314-cp314t-macosx_10_15_x86_64.whl", hash = "sha256:f351e0dd702687d12a402b867a1b4146a256923e1c38317cbc472f6372b94707", size = 31399325, upload-time = "2026-06-19T15:01:13.723Z" },
-    { url = "https://files.pythonhosted.org/packages/7b/d1/1f287b57c0ff0ee5185dff3946d92c8017d39b0e431f0ae79a3ff1859512/scipy-1.18.0-cp314-cp314t-macosx_12_0_arm64.whl", hash = "sha256:7c7a51b33ce387193c97f228320cf8e87361daa1bba750638677729598b3e677", size = 29092110, upload-time = "2026-06-19T15:01:16.908Z" },
-    { url = "https://files.pythonhosted.org/packages/ff/1a/7b74eb6c392fdcb27d414c0e7558a6d0231eb3b6d73571f479bb81ea8794/scipy-1.18.0-cp314-cp314t-macosx_14_0_arm64.whl", hash = "sha256:84031d7b052a54fae2f8632e0ec802073d385476eb9a63079bce6e23ef9283d4", size = 20833811, upload-time = "2026-06-19T15:01:20.488Z" },
-    { url = "https://files.pythonhosted.org/packages/7c/ad/f3941716320a7b9cb4d68734a903b45fe16eff5fb7da7e16f2e619304979/scipy-1.18.0-cp314-cp314t-macosx_14_0_x86_64.whl", hash = "sha256:56abf29a7c067dde59be8b9a22d606a4ea1b2f2a4b756d9d903c62818f5dacce", size = 23396644, upload-time = "2026-06-19T15:01:23.364Z" },
-    { url = "https://files.pythonhosted.org/packages/22/22/1446b62ffe07f9719b7d9b1b6a4e05a772833ae8f441fe4c22c34c9b250f/scipy-1.18.0-cp314-cp314t-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:1ad44305cfa24b1ba5803cbbebf033590ccbac1aa5d612d727b785325ab408b0", size = 34079318, upload-time = "2026-06-19T15:01:26.002Z" },
-    { url = "https://files.pythonhosted.org/packages/56/3b/b87da667098bb470fa30c7011b0ba351ee976dd395c78798c66e941665a3/scipy-1.18.0-cp314-cp314t-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:945c1761b93f38d7f99ae81ae80c63e621471608c7eeead563f6df025585cd58", size = 35324320, upload-time = "2026-06-19T15:01:28.881Z" },
-    { url = "https://files.pythonhosted.org/packages/f8/a1/c7932f91909759b0267f75fdea34e91309f96b895757534b76a90b6b4344/scipy-1.18.0-cp314-cp314t-musllinux_1_2_aarch64.whl", hash = "sha256:1a4441f15d620578772a49e5ab48c0ee1f7a0220e387110283062729136b2553", size = 35699541, upload-time = "2026-06-19T15:01:31.968Z" },
-    { url = "https://files.pythonhosted.org/packages/f7/86/5185061a1fcc41d18c5dc2463969b3a3964b31d9ac67b2fb05d4c7ff7670/scipy-1.18.0-cp314-cp314t-musllinux_1_2_x86_64.whl", hash = "sha256:9aac6192fac56bf2ca534389d24623f07b39ff83317d58287285e7fbd622ff76", size = 37472480, upload-time = "2026-06-19T15:01:35.136Z" },
-    { url = "https://files.pythonhosted.org/packages/31/8e/f04c68e39919a010d34f2ee1367fd705b0a25a02f609d755f0bfbc0a15fc/scipy-1.18.0-cp314-cp314t-win_amd64.whl", hash = "sha256:e40baea28ae7f5475c779741e2d90b1247c78531207b49c7030e698ff81cee3f", size = 37365390, upload-time = "2026-06-19T15:01:38.091Z" },
-    { url = "https://files.pythonhosted.org/packages/d5/19/969dc072906c84dd0a3b05dcf57ea750936087d7873549e408b35cfc3f97/scipy-1.18.0-cp314-cp314t-win_arm64.whl", hash = "sha256:368e0a705903c466aa5f08eefb39e6b1b6b2d659e7352a31fd9e2438365be0f8", size = 25279661, upload-time = "2026-06-19T15:01:40.817Z" },
-]
-
-[[package]]
-name = "sentence-transformers"
-version = "5.6.0"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "huggingface-hub" },
-    { name = "numpy" },
-    { name = "scikit-learn" },
-    { name = "scipy" },
-    { name = "torch" },
-    { name = "tqdm" },
-    { name = "transformers" },
-    { name = "typing-extensions" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/f9/56/d2cb00765a6b15c994a7fccf20f9032f16e8193ca49147cb5155166ad744/sentence_transformers-5.6.0.tar.gz", hash = "sha256:0e7164d051e416c1853ade7c274ff52af3f9da0f4be7f0b83d734c27699e1057", size = 453194, upload-time = "2026-06-16T14:01:56.42Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/76/c1/dc1582b79e9a2eb0cddf9559cd9bcdff084f541d6fe881fdd9d98630dba7/sentence_transformers-5.6.0-py3-none-any.whl", hash = "sha256:d2075b5e687a1611005e20ab04a6846994d51adfcf39610aed066af3c0c0b81f", size = 596411, upload-time = "2026-06-16T14:01:55.103Z" },
-]
-
-[[package]]
-name = "setuptools"
-version = "81.0.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/0d/1c/73e719955c59b8e424d015ab450f51c0af856ae46ea2da83eba51cc88de1/setuptools-81.0.0.tar.gz", hash = "sha256:487b53915f52501f0a79ccfd0c02c165ffe06631443a886740b91af4b7a5845a", size = 1198299, upload-time = "2026-02-06T21:10:39.601Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/e1/e3/c164c88b2e5ce7b24d667b9bd83589cf4f3520d97cad01534cd3c4f55fdb/setuptools-81.0.0-py3-none-any.whl", hash = "sha256:fdd925d5c5d9f62e4b74b30d6dd7828ce236fd6ed998a08d81de62ce5a6310d6", size = 1062021, upload-time = "2026-02-06T21:10:37.175Z" },
-]
-
-[[package]]
-name = "shellingham"
-version = "1.5.4"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/58/15/8b3609fd3830ef7b27b655beb4b4e9c62313a4e8da8c676e142cc210d58e/shellingham-1.5.4.tar.gz", hash = "sha256:8dbca0739d487e5bd35ab3ca4b36e11c4078f3a234bfce294b0a0291363404de", size = 10310, upload-time = "2023-10-24T04:13:40.426Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/e0/f9/0595336914c5619e5f28a1fb793285925a8cd4b432c9da0a987836c7f822/shellingham-1.5.4-py2.py3-none-any.whl", hash = "sha256:7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686", size = 9755, upload-time = "2023-10-24T04:13:38.866Z" },
-]
-
 [[package]]
 name = "smmap"
 version = "5.0.3"
@@ -1423,18 +851,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/a9/18/489c97b834dfff9cf2fc2507cede4bcd4b11e67f84bc462acd1992496f86/structlog-26.1.0-py3-none-any.whl", hash = "sha256:e081a26d6c373e6d201eca24eede26d8ffab07f88f477822e679183428d3d91e", size = 73764, upload-time = "2026-06-06T07:33:38.046Z" },
 ]
 
-[[package]]
-name = "sympy"
-version = "1.14.0"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "mpmath" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/83/d3/803453b36afefb7c2bb238361cd4ae6125a569b4db67cd9e79846ba2d68c/sympy-1.14.0.tar.gz", hash = "sha256:d3d3fe8df1e5a0b42f0e7bdf50541697dbe7d23746e894990c030e2b05e72517", size = 7793921, upload-time = "2025-04-27T18:05:01.611Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/a2/09/77d55d46fd61b4a135c444fc97158ef34a095e5681d0a6c10b75bf356191/sympy-1.14.0-py3-none-any.whl", hash = "sha256:e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5", size = 6299353, upload-time = "2025-04-27T18:04:59.103Z" },
-]
-
 [[package]]
 name = "tach"
 version = "0.35.0"
@@ -1468,41 +884,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/4b/1d/5dddf88fa9433bf4fcc76afad18e49d8e50e24f1f40c981c286edccd6c2d/tach-0.35.0-cp37-abi3-win_amd64.whl", hash = "sha256:746271a5313c348e00c1b85927260e3e1a75351d86b2da1746e85c5dd77051e6", size = 3671788, upload-time = "2026-05-12T12:48:59.619Z" },
 ]
 
-[[package]]
-name = "threadpoolctl"
-version = "3.6.0"
-source = { registry = "https://pypi.org/simple" }
-sdist = { url = "https://files.pythonhosted.org/packages/b7/4d/08c89e34946fce2aec4fbb45c9016efd5f4d7f24af8e5d93296e935631d8/threadpoolctl-3.6.0.tar.gz", hash = "sha256:8ab8b4aa3491d812b623328249fab5302a68d2d71745c8a4c719a2fcaba9f44e", size = 21274, upload-time = "2025-03-13T13:49:23.031Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/32/d5/f9a850d79b0851d1d4ef6456097579a9005b31fea68726a4ae5f2d82ddd9/threadpoolctl-3.6.0-py3-none-any.whl", hash = "sha256:43a0b8fd5a2928500110039e43a5eed8480b918967083ea48dc3ab9f13c4a7fb", size = 18638, upload-time = "2025-03-13T13:49:21.846Z" },
-]
-
-[[package]]
-name = "tokenizers"
-version = "0.22.2"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "huggingface-hub" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/73/6f/f80cfef4a312e1fb34baf7d85c72d4411afde10978d4657f8cdd811d3ccc/tokenizers-0.22.2.tar.gz", hash = "sha256:473b83b915e547aa366d1eee11806deaf419e17be16310ac0a14077f1e28f917", size = 372115, upload-time = "2026-01-05T10:45:15.988Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/92/97/5dbfabf04c7e348e655e907ed27913e03db0923abb5dfdd120d7b25630e1/tokenizers-0.22.2-cp39-abi3-macosx_10_12_x86_64.whl", hash = "sha256:544dd704ae7238755d790de45ba8da072e9af3eea688f698b137915ae959281c", size = 3100275, upload-time = "2026-01-05T10:41:02.158Z" },
-    { url = "https://files.pythonhosted.org/packages/2e/47/174dca0502ef88b28f1c9e06b73ce33500eedfac7a7692108aec220464e7/tokenizers-0.22.2-cp39-abi3-macosx_11_0_arm64.whl", hash = "sha256:1e418a55456beedca4621dbab65a318981467a2b188e982a23e117f115ce5001", size = 2981472, upload-time = "2026-01-05T10:41:00.276Z" },
-    { url = "https://files.pythonhosted.org/packages/d6/84/7990e799f1309a8b87af6b948f31edaa12a3ed22d11b352eaf4f4b2e5753/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl", hash = "sha256:2249487018adec45d6e3554c71d46eb39fa8ea67156c640f7513eb26f318cec7", size = 3290736, upload-time = "2026-01-05T10:40:32.165Z" },
-    { url = "https://files.pythonhosted.org/packages/78/59/09d0d9ba94dcd5f4f1368d4858d24546b4bdc0231c2354aa31d6199f0399/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_armv7l.manylinux2014_armv7l.whl", hash = "sha256:25b85325d0815e86e0bac263506dd114578953b7b53d7de09a6485e4a160a7dd", size = 3168835, upload-time = "2026-01-05T10:40:38.847Z" },
-    { url = "https://files.pythonhosted.org/packages/47/50/b3ebb4243e7160bda8d34b731e54dd8ab8b133e50775872e7a434e524c28/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_i686.manylinux2014_i686.whl", hash = "sha256:bfb88f22a209ff7b40a576d5324bf8286b519d7358663db21d6246fb17eea2d5", size = 3521673, upload-time = "2026-01-05T10:40:56.614Z" },
-    { url = "https://files.pythonhosted.org/packages/e0/fa/89f4cb9e08df770b57adb96f8cbb7e22695a4cb6c2bd5f0c4f0ebcf33b66/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_ppc64le.manylinux2014_ppc64le.whl", hash = "sha256:1c774b1276f71e1ef716e5486f21e76333464f47bece56bbd554485982a9e03e", size = 3724818, upload-time = "2026-01-05T10:40:44.507Z" },
-    { url = "https://files.pythonhosted.org/packages/64/04/ca2363f0bfbe3b3d36e95bf67e56a4c88c8e3362b658e616d1ac185d47f2/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_s390x.manylinux2014_s390x.whl", hash = "sha256:df6c4265b289083bf710dff49bc51ef252f9d5be33a45ee2bed151114a56207b", size = 3379195, upload-time = "2026-01-05T10:40:51.139Z" },
-    { url = "https://files.pythonhosted.org/packages/2e/76/932be4b50ef6ccedf9d3c6639b056a967a86258c6d9200643f01269211ca/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl", hash = "sha256:369cc9fc8cc10cb24143873a0d95438bb8ee257bb80c71989e3ee290e8d72c67", size = 3274982, upload-time = "2026-01-05T10:40:58.331Z" },
-    { url = "https://files.pythonhosted.org/packages/1d/28/5f9f5a4cc211b69e89420980e483831bcc29dade307955cc9dc858a40f01/tokenizers-0.22.2-cp39-abi3-musllinux_1_2_aarch64.whl", hash = "sha256:29c30b83d8dcd061078b05ae0cb94d3c710555fbb44861139f9f83dcca3dc3e4", size = 9478245, upload-time = "2026-01-05T10:41:04.053Z" },
-    { url = "https://files.pythonhosted.org/packages/6c/fb/66e2da4704d6aadebf8cb39f1d6d1957df667ab24cff2326b77cda0dcb85/tokenizers-0.22.2-cp39-abi3-musllinux_1_2_armv7l.whl", hash = "sha256:37ae80a28c1d3265bb1f22464c856bd23c02a05bb211e56d0c5301a435be6c1a", size = 9560069, upload-time = "2026-01-05T10:45:10.673Z" },
-    { url = "https://files.pythonhosted.org/packages/16/04/fed398b05caa87ce9b1a1bb5166645e38196081b225059a6edaff6440fac/tokenizers-0.22.2-cp39-abi3-musllinux_1_2_i686.whl", hash = "sha256:791135ee325f2336f498590eb2f11dc5c295232f288e75c99a36c5dbce63088a", size = 9899263, upload-time = "2026-01-05T10:45:12.559Z" },
-    { url = "https://files.pythonhosted.org/packages/05/a1/d62dfe7376beaaf1394917e0f8e93ee5f67fea8fcf4107501db35996586b/tokenizers-0.22.2-cp39-abi3-musllinux_1_2_x86_64.whl", hash = "sha256:38337540fbbddff8e999d59970f3c6f35a82de10053206a7562f1ea02d046fa5", size = 10033429, upload-time = "2026-01-05T10:45:14.333Z" },
-    { url = "https://files.pythonhosted.org/packages/fd/18/a545c4ea42af3df6effd7d13d250ba77a0a86fb20393143bbb9a92e434d4/tokenizers-0.22.2-cp39-abi3-win32.whl", hash = "sha256:a6bf3f88c554a2b653af81f3204491c818ae2ac6fbc09e76ef4773351292bc92", size = 2502363, upload-time = "2026-01-05T10:45:20.593Z" },
-    { url = "https://files.pythonhosted.org/packages/65/71/0670843133a43d43070abeb1949abfdef12a86d490bea9cd9e18e37c5ff7/tokenizers-0.22.2-cp39-abi3-win_amd64.whl", hash = "sha256:c9ea31edff2968b44a88f97d784c2f16dc0729b8b143ed004699ebca91f05c48", size = 2747786, upload-time = "2026-01-05T10:45:18.411Z" },
-    { url = "https://files.pythonhosted.org/packages/72/f4/0de46cfa12cdcbcd464cc59fde36912af405696f687e53a091fb432f694c/tokenizers-0.22.2-cp39-abi3-win_arm64.whl", hash = "sha256:9ce725d22864a1e965217204946f830c37876eee3b2ba6fc6255e8e903d5fcbc", size = 2612133, upload-time = "2026-01-05T10:45:17.232Z" },
-]
-
 [[package]]
 name = "tomli"
 version = "2.4.1"
@@ -1548,81 +929,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/6a/43/8bd850ee71a191bf072e31302c73a66be413fecdd98fdcd111ecbcce13ca/tomlkit-0.15.0-py3-none-any.whl", hash = "sha256:4dbc8f0fc024412b57ced8757ac7461305126a648ff8c2c807fcb8e133a78738", size = 41328, upload-time = "2026-05-10T07:38:23.517Z" },
 ]
 
-[[package]]
-name = "torch"
-version = "2.12.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "cuda-bindings", marker = "sys_platform == 'linux'" },
-    { name = "cuda-toolkit", extra = ["cudart", "cufft", "cufile", "cupti", "curand", "cusolver", "cusparse", "nvjitlink", "nvrtc", "nvtx"], marker = "sys_platform == 'linux'" },
-    { name = "filelock" },
-    { name = "fsspec" },
-    { name = "jinja2" },
-    { name = "networkx" },
-    { name = "nvidia-cublas", marker = "sys_platform == 'linux'" },
-    { name = "nvidia-cudnn-cu13", marker = "sys_platform == 'linux'" },
-    { name = "nvidia-cusparselt-cu13", marker = "sys_platform == 'linux'" },
-    { name = "nvidia-nccl-cu13", marker = "sys_platform == 'linux'" },
-    { name = "nvidia-nvshmem-cu13", marker = "sys_platform == 'linux'" },
-    { name = "setuptools" },
-    { name = "sympy" },
-    { name = "triton", marker = "sys_platform == 'linux'" },
-    { name = "typing-extensions" },
-]
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/63/b7/1b49fe7086ea36839cc80abc43174c43d0ab6f676c0891c871c162f44fe3/torch-2.12.1-cp314-cp314-macosx_14_0_arm64.whl", hash = "sha256:e9b6f7d2dd66ea87a3ae620069d31335d594c06effb1a383bdd21cfe61e44ece", size = 88010025, upload-time = "2026-06-17T21:07:03.934Z" },
-    { url = "https://files.pythonhosted.org/packages/d7/06/5b44063a6545036dcc680d2d303b137d9176cfb2cc1e1863e3ef94abeb52/torch-2.12.1-cp314-cp314-manylinux_2_28_aarch64.whl", hash = "sha256:7973ccd3d2cd35c74449213f7bded199bec6c6247e705cbeda7407af79703d91", size = 426392891, upload-time = "2026-06-17T21:05:52.261Z" },
-    { url = "https://files.pythonhosted.org/packages/f8/dd/c9ce9a4b0eb3c5bb92d9ea56766e2c22559f0b45171149188494edcce80f/torch-2.12.1-cp314-cp314-manylinux_2_28_x86_64.whl", hash = "sha256:c64ac4aac16be5e296dcd912305605804b203333c690bf98c55bc09494ee92ad", size = 532272494, upload-time = "2026-06-17T21:06:22.72Z" },
-    { url = "https://files.pythonhosted.org/packages/21/7c/f3a601fc1b1f663ff269bfe553654e638651939aa6563e8daa7167c33098/torch-2.12.1-cp314-cp314-win_amd64.whl", hash = "sha256:f6dc4caf7eb4adb38a2d9f536b51db56310fdd1254e69a2d96767e1367c892b3", size = 122987254, upload-time = "2026-06-17T21:06:33.199Z" },
-    { url = "https://files.pythonhosted.org/packages/e6/8c/b8087556cf81ddd808dbeb34afb8396d7ae7a1694ab489f08b1a0004e7d0/torch-2.12.1-cp314-cp314t-macosx_14_0_arm64.whl", hash = "sha256:2afbb2bdaa8a95040e733f05492ddf133c3967c9b7ce0abd218d704b6cab437d", size = 88303173, upload-time = "2026-06-17T21:05:06.603Z" },
-    { url = "https://files.pythonhosted.org/packages/4a/07/fe09d1699fbed2afa10ebc692ff2b99d113f2605b6748cea633989e2789a/torch-2.12.1-cp314-cp314t-manylinux_2_28_aarch64.whl", hash = "sha256:97eba061fcb042fed191400b15568990073d67eaacaa6ee9b7ca01dd8b790fe9", size = 426404009, upload-time = "2026-06-17T21:04:57.557Z" },
-    { url = "https://files.pythonhosted.org/packages/2e/f7/0ce4f6c1962c60ded7270e0a9eb560fb615c92b89d332cf9e3dff36d5ecc/torch-2.12.1-cp314-cp314t-manylinux_2_28_x86_64.whl", hash = "sha256:3867b861391701012adb2df93360efb88494dca245a185e3bb7624495cfe3f33", size = 532184292, upload-time = "2026-06-17T21:05:17.526Z" },
-    { url = "https://files.pythonhosted.org/packages/70/db/e384c12aba30320ca92aaaf557456cbcb26f04b4df307728bb8f019f5000/torch-2.12.1-cp314-cp314t-win_amd64.whl", hash = "sha256:dd15595f8fc764cffde8c6361a3beb6ef69a028c851b1b3e70e077f615980d4e", size = 123231142, upload-time = "2026-06-17T21:05:27.061Z" },
-]
-
-[[package]]
-name = "tqdm"
-version = "4.68.3"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "colorama", marker = "sys_platform == 'win32'" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/87/d7/0535a28b1f5f24f6612fb3ff1e89fb1a8d160fee0f976e0aa6803862134b/tqdm-4.68.3.tar.gz", hash = "sha256:00dfa48452b6b6cfae3dd9885636c23d3422d1ec97c66d96818cbd5e0821d482", size = 170596, upload-time = "2026-06-17T07:36:52.105Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/d8/8e/bb97bb0c71802080bfc8952937d174e49cfc50de5c951dd47b2496f0dcdb/tqdm-4.68.3-py3-none-any.whl", hash = "sha256:39832cc2def2789a6f29df83f172db7416cea70052c0907a57801c5f2fdccb03", size = 78337, upload-time = "2026-06-17T07:36:50.132Z" },
-]
-
-[[package]]
-name = "transformers"
-version = "5.12.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "huggingface-hub" },
-    { name = "numpy" },
-    { name = "packaging" },
-    { name = "pyyaml" },
-    { name = "regex" },
-    { name = "safetensors" },
-    { name = "tokenizers" },
-    { name = "tqdm" },
-    { name = "typer" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/aa/7c/8240f612819718100a9346dc28dea6a11370c3ca9c8c6eabadd3dea4ef29/transformers-5.12.1.tar.gz", hash = "sha256:679ee731c8225347889ad4fb3b2c926a62e9da3b7d284e9d12c791da7272466b", size = 8924054, upload-time = "2026-06-15T17:27:50.604Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/df/56/bbd60dd8668055803bf8ba55a81f9b8a8b31497f620109a9671d26a2076d/transformers-5.12.1-py3-none-any.whl", hash = "sha256:2a5e109d2021265df7098ffbb738295acaf5ad256f12cbc586db2ea4dcbb1a8a", size = 11150587, upload-time = "2026-06-15T17:27:46.679Z" },
-]
-
-[[package]]
-name = "triton"
-version = "3.7.1"
-source = { registry = "https://pypi.org/simple" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/40/71/e01aa7ad573883ed9456f130226babdec70b005e098c4d6226a6238e761b/triton-3.7.1-cp314-cp314-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:fe4ea396a06171f1f1f58cbd39c70b09294398f7dd7c620939bab54ad6f934fa", size = 184705764, upload-time = "2026-06-17T20:03:59.064Z" },
-    { url = "https://files.pythonhosted.org/packages/a4/09/5683146fda6a2b569deb78ccfd8fbfea8bfe55f726b081c0a6bb18dd6f28/triton-3.7.1-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:2020153b08280415ec0da6607834e79166442147e78e144df06b508c75b186d2", size = 197729537, upload-time = "2026-06-17T19:53:35.516Z" },
-    { url = "https://files.pythonhosted.org/packages/e9/f8/448220c3092019f9fdfab39ec47985968181d67da34b44f6a7f6280a5cbb/triton-3.7.1-cp314-cp314t-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl", hash = "sha256:c58e4c61f0c73b5dba3b5d19b4a7093c32f90dc18b2a7f121a7c16ccd31107b7", size = 184814760, upload-time = "2026-06-17T20:04:04.984Z" },
-    { url = "https://files.pythonhosted.org/packages/f0/ac/229b7d4589d2e5937310e72c6d46e89599d16a4a12b479ffa1499fee8eb8/triton-3.7.1-cp314-cp314t-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl", hash = "sha256:10ba85fa2cca4a2fbdeb36bf1cb082f2c252bda55bf9fccd74f65ec5bc647e68", size = 197824404, upload-time = "2026-06-17T19:53:42.772Z" },
-]
-
 [[package]]
 name = "ty"
 version = "0.0.49"
@@ -1660,21 +966,6 @@ wheels = [
     { url = "https://files.pythonhosted.org/packages/5b/29/74eeb4d3f3ae61ca096b018ad486b3b3c74b17bec09ab4edab721cbefec3/typeguard-4.5.2-py3-none-any.whl", hash = "sha256:fcf9de18bd945cdb4c7b996e12b4c51ce83f92f191314a6d7cf1739586ec98cf", size = 36748, upload-time = "2026-05-14T12:59:39.473Z" },
 ]
 
-[[package]]
-name = "typer"
-version = "0.25.1"
-source = { registry = "https://pypi.org/simple" }
-dependencies = [
-    { name = "annotated-doc" },
-    { name = "click" },
-    { name = "rich" },
-    { name = "shellingham" },
-]
-sdist = { url = "https://files.pythonhosted.org/packages/e4/51/9aed62104cea109b820bbd6c14245af756112017d309da813ef107d42e7e/typer-0.25.1.tar.gz", hash = "sha256:9616eb8853a09ffeabab1698952f33c6f29ffdbceb4eaeecf571880e8d7664cc", size = 122276, upload-time = "2026-04-30T19:32:16.964Z" }
-wheels = [
-    { url = "https://files.pythonhosted.org/packages/3f/f9/2b3ff4e56e5fa7debfaf9eb135d0da96f3e9a1d5b27222223c7296336e5f/typer-0.25.1-py3-none-any.whl", hash = "sha256:75caa44ed46a03fb2dab8808753ffacdbfea88495e74c85a28c5eefcf5f39c89", size = 58409, upload-time = "2026-04-30T19:32:18.271Z" },
-]
-
 [[package]]
 name = "types-defusedxml"
 version = "0.7.0.20260504"

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
