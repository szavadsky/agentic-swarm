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
  "slug": "runner-format-contract",
  "kind": "dev",
  "title": "Ruff format strategy and 14-tool registry fix",
  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
  "outlineRef": "runner-format-contract",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1-1",
    "M1-2",
    "M1-3"
  ],
  "citations": [
    "AGENTS.md:87-93",
    "AGENTS.md:121-139",
    "lint.baseline:1-1"
  ]
}

## Target
{
  "selectors": [
    "tests/runner/test_runner_format_contract.py",
    "tests/runner/test_lint_runner.py::TestToolSpec",
    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
    "tests/runner/test_t3_coverage.py::TestParserCompleteness",
    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants"
  ],
  "expectRed": [
    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_command_given_normal_pass_then_check_mode",
    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode",
    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_default_config_paths_given_ruff_format_then_ruff_toml",
    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_config_flag_for_ruff_format_then_config_flag",
    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_expected_tool_names_given_exported_then_matches_builtins",
    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_formatter_only_and_statistics_parser_tools_partition_all_tools",
    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_record_parser_and_recordless_tools_partition_all_tools",
    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_then_match_parser_tables",
    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects",
    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_without_fix_runs_ruff_format_check_only",
    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_with_fix_formats_first_then_checks",
    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser",
    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_parsers_then_correspond_to_tools",
    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_statistics_flags_then_align_with_parsers",
    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]",
    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]"
  ]
}

## Context & Citations
[
  "AGENTS.md:87-93",
  "AGENTS.md:121-139",
  "lint.baseline:1-1"
]

## Review Feedback

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
