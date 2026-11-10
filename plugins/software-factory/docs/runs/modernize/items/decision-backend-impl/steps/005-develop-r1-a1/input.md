# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

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

## Target
{
  "selectors": [
    "tests/checkers/test_decision_backend.py",
    "tests/checkers/test_semantic_check.py",
    "tests/checkers/test_no_try_import_checker.py",
    "tests/checkers/test_suppression_justification_checker.py",
    "tests/assumptions/test_pylint_cache_semantics.py"
  ],
  "expectRed": [
    "tests/checkers/test_decision_backend.py::test_fake_backend_defaults_to_one_and_pinned_model_id",
    "tests/checkers/test_decision_backend.py::test_fake_backend_returns_configured_score",
    "tests/checkers/test_decision_backend.py::test_fake_backend_satisfies_protocol",
    "tests/checkers/test_decision_backend.py::test_get_backend_is_none_without_configuration",
    "tests/checkers/test_decision_backend.py::test_get_backend_honors_dotted_path_under_pytest",
    "tests/checkers/test_decision_backend.py::test_get_backend_ignores_dotted_path_in_production",
    "tests/checkers/test_decision_backend.py::test_decision_model_parses_but_yields_none_with_exactly_one_warning",
    "tests/checkers/test_decision_backend.py::test_reranker_model_env_is_deprecated_with_exactly_one_warning",
    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_has_backend_keyword_defaulting_to_none",
    "tests/checkers/test_decision_backend.py::test_registered_backend_rejects_a_meaningful_heuristic",
    "tests/checkers/test_decision_backend.py::test_brush_off_is_vetoed_before_the_backend",
    "tests/checkers/test_decision_backend.py::test_brush_off_does_not_reach_the_semantic_adapter",
    "tests/checkers/test_decision_backend.py::test_meaningful_heuristic_is_confirmed_by_backend",
    "tests/checkers/test_decision_backend.py::test_backend_below_threshold_rejects_a_meaningful_heuristic",
    "tests/checkers/test_decision_backend.py::test_semantic_disabled_never_calls_the_backend",
    "tests/checkers/test_decision_backend.py::test_check_if_meaningful_rejects_code_echo_justification",
    "tests/checkers/test_decision_backend.py::test_semantic_extra_is_empty",
    "tests/checkers/test_decision_backend.py::test_uv_lock_has_no_sentence_transformers_edge",
    "tests/checkers/test_semantic_check.py::test_signature_exposes_backend_keyword_defaulting_to_none",
    "tests/checkers/test_semantic_check.py::test_empty_primary_returns_false_without_calling_backend",
    "tests/checkers/test_semantic_check.py::test_one_backend_call_per_unique_pair",
    "tests/checkers/test_semantic_check.py::test_distinct_pairs_call_backend_again",
    "tests/checkers/test_semantic_check.py::test_memo_key_includes_backend_model_id",
    "tests/checkers/test_semantic_check.py::test_module_does_not_reference_sentence_transformers",
    "tests/checkers/test_semantic_check.py::test_check_writes_no_disk_cache",
    "tests/checkers/test_no_try_import_checker.py::test_sentence_transformers_is_no_longer_an_optional_import_pattern",
    "tests/checkers/test_no_try_import_checker.py::test_try_import_of_sentence_transformers_is_flagged",
    "tests/checkers/test_suppression_justification_checker.py::TestAnyElementCodeEcho::test_code_echo_on_any_element_is_rejected",
    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_new_verdicts_then_backend_calls_once_each_and_writes_nothing",
    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_repeated_pair_then_serves_memory_without_backend_or_write",
    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticInProcessMemo::test_given_empty_primary_then_returns_false_without_backend_or_write",
    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_semantic_check_if_meaningful_given_identical_inputs_then_signature_is_path_free",
    "tests/assumptions/test_pylint_cache_semantics.py::TestSemanticPathScoping::test_checker_sources_given_source_tree_then_no_result_cache_writer"
  ]
}

## Context & Citations
[
  "src/python_setup_lint/checkers/_semantic.py:1-12",
  "src/python_setup_lint/checkers/_semantic.py:93-122",
  "src/python_setup_lint/checkers/_semantic.py:125-189",
  "src/python_setup_lint/checkers/_base.py:142-158",
  "pyproject.toml:28-31",
  "AGENTS.md:79-85"
]

## Review Feedback
Fix in this order (zero tests/data writes; golden-regen-hatch is sole golden writer; no shift report — this is a no-shift bug): (1) Preserve SEMANTIC=0 exactly: keep `os.environ.get('PYTHON_SETUP_LINT_SEMANTIC','1')=='1'` guard; when '0', skip semantic/backend entirely and return the heuristic bool directly. (2) Restore heuristic byte-identical to _base.py:160-238: primary=(comment or text).strip(); empty/<5 False; exact `primary_lower in boilerplate` (50-entry, no word-split/substring); exact `primary_lower in meaningless_phrases` (no substring); rule-echo only as `primary_lower == any(element_lower)` over normalize_suppressed_codes(rule).split(',') — no suppression-pattern rejection, no extra boilerplate. Nachweis: check_if_meaningful('pylint: disable=some-rule', rule='unjustified-suppression', code_context='def _bare_suppression() -> None:', comment=same) with SEMANTIC=0 must be True (preceding-suppression quirk from suppression_justification_checker.py:377-386; checker-level fix belongs to checkers-legacy, not backend). (3) None mapping: semantic_check returns None (not False) when loader/backend None; veto heuristic AND (prob>=0.5) only when backend returns float. (4) Revert any test asserts of the buggy False for line-42-style reasons; keep test_decision_backend.py but pin SEMANTIC=0 preservation. Minimize tests/assumptions + test_semantic_check churn (full rewrite is semantic-tests-rewrite via dep). (5) Verify: `uv run pytest tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint -q` golden hash-equal (line 41 only, no line 42); `uv run pytest -q` no new failures vs M1 table; uv.lock still resolves.

Failing check: gates

Message: Gate regressions: test-integration

Detail:
olden_path}\")\n            warnings.warn(f\"updating golden files for {golden_path}\", stacklevel=2)\n            write_golden_files(golden_path, findings)\n            return\n        committed = read_golden(golden_path)\n        added, removed = _diff_keys(findings, committed)\n        if added or removed:\n>           pytest.fail(_format_drift(added, removed, golden_path))\nE           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nE           added (3):\nE             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n\ntests/_golden.py:389: Failed\n========================= Tach Impact Analysis Warning =========================\n[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!\n[Tach] These failures would be missed when using --tach:\n[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint\n=========================== short test summary info ============================\nFAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nadded (3):\n  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n1 failed, 8 passed in 48.82s\n[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]",
    "failingTests": [
      "tests.integration.TestMinimalSampleProject.test_setup_new_and_lint"
    ]
  }
]

Output tail:
get("GITHUB_ACTIONS"):
                pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
            warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
            write_golden_files(golden_path, findings)
            return
        committed = read_golden(golden_path)
        added, removed = _diff_keys(findings, committed)
        if added or removed:
>           pytest.fail(_format_drift(added, removed, golden_path))
E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
E           added (3):
E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')

tests/_golden.py:389: Failed
========================= Tach Impact Analysis Warning =========================
[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
[Tach] These failures would be missed when using --tach:
[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
=========================== short test summary info ============================
FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
added (3):
  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
1 failed, 8 passed in 48.82s
[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]

Budget: 299 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
- summary (string, required): Concise summary of implementation actions and test results
- target (object, optional): Target test selectors, gate, or custom command for red/green verification
  - Option 1:
    - selectors (array of string, required)
    - expectRed (array of string, required, minItems: 1)
  - Option 2:
    - gate (string, required)
  - Option 3:
    - command (string, required)
    - customTarget (boolean, required)
- evidence (array of string, optional): List of executed checks and verification commands proving correctness
- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
- notes (string, optional): Optional developer notes, implementation observations, or comments
