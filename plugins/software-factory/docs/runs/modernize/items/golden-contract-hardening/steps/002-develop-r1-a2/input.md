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
  "slug": "golden-contract-hardening",
  "kind": "test-only",
  "title": "Harden golden via caller asserts and shared slicer",
  "assignment": "GOAL: Harden golden contract via caller asserts and shared slicer per ADR-006; committed files never mutated by proofs. SCOPE: tests only. STEPS: Keep collect_findings(project,config) in tool order with no sort (synthetic-empty safe); sorting stays in serialize_write plus _diff_keys; add caller asserts in test_setup_new_and_lint (len findings not zero post-collect; first-run CRASH absent plus SKIPPED only package_name retained); keep Counter-multiset diff plus UPDATE guard failing under CI and GITHUB_ACTIONS plus oracle and tool coverage (read_oracle_rules, assert_oracle_coverage, assert_tool_coverage); use slice_tool_section(output,[pylint],[pylint-pyi]) in overlay test; extend tests/test_golden.py synthetic coverage for ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe; no Finding CRASH sentinel. Determinism via temp-copy double-collect: collect plus serialize on two fresh temp copies, sha256 hashes equal each other and equal committed golden hash. UPDATE_GOLDEN equals 1 never touches committed files except reviewed regen. VERIFY: integration plus test_golden pass; golden plus counts byte-identical.",
  "outlineRef": "golden-contract-hardening",
  "milestone": "M2",
  "wave": 2,
  "deps": [
    "consolidate-integration-helpers-i2"
  ],
  "scenarioRefs": [
    "M2-3"
  ],
  "citations": [
    "CodingRules.md:230-306",
    "AGENTS.md:87-93",
    "pyproject.toml:49-49",
    "lint.baseline:1-1"
  ]
}

## Target
{
  "command": "uv run pytest tests/test_golden.py tests/integration.py -q",
  "customTarget": true
}

## Context & Citations
[
  "CodingRules.md:230-306",
  "AGENTS.md:87-93",
  "pyproject.toml:49-49",
  "lint.baseline:1-1"
]

## Review Feedback
Failing check: gates

Message: Gate regressions: format, lint

Detail:
e--golden-contract-hardening/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead\n    assert isinstance(node, astroid.NodeNG)\n\n-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html\n1357 passed, 4 skipped, 18 deselected, 4 warnings in 30.26s\n[Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]",
    "improvements": [
      "tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present",
      "tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates",
      "tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered",
      "tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser",
      "tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]"
    ]
  },
  {
    "id": "test-integration",
    "command": "uv run pytest tests/integration.py -q",
    "status": "pass",
    "durationMs": 83325,
    "details": "[Tach] 9 tests in 4 files unaffected by changes (~1m 11s could be saved). Skip with: pytest --tach\n[Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)\n.........                                                                [100%]\n9 passed in 82.24s (0:01:22)"
  }
]

Output tail:
oved in v5, import it from 'astroid.nodes' instead
    assert isinstance(node, astroid.NodeNG)

tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
  /home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-contract-hardening/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
    assert isinstance(node, astroid.NodeNG)

tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
  /home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-contract-hardening/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
    assert isinstance(node, astroid.NodeNG)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
1357 passed, 4 skipped, 18 deselected, 4 warnings in 30.26s
[Improvements: tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present, tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates, tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered, tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser, tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]]

[test-integration] pass:
[Tach] 9 tests in 4 files unaffected by changes (~1m 11s could be saved). Skip with: pytest --tach
[Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
.........                                                                [100%]
9 passed in 82.24s (0:01:22)

Budget: 0 prod lines changed vs storyMaxProdLines 300 (kind test-only). Shrink the diff or escalate; do not re-verify green checks from scratch.

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
