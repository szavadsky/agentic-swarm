# Step: Fix-Round

## Goal
Address reviewer suggestions and gate failures from the previous development attempt. Deliver focused corrections resolving reported defects.

## Rules
- Defect resolution: resolve all suggestions marked with disposition `fix`. Consider `optional` suggestions only if straightforward and safe.
- Delta focus: keep changes tightly scoped to reported concerns. Do not introduce unrelated modifications or refactors.
- Non-regression: ensure all previously green tests remain passing and all project gates pass cleanly.
- Updated evidence: yield `status: ok` with updated `evidence` (array of strings) documenting personal verification of each corrected defect per `developer-output.schema.json`.

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

## Review Feedback
- [FIX] Fix new ruff I001 in runner __init__.py/.pyi import sort: Independent repro with shipped config fails: `uv run ruff check --config config/ruff.toml src/python_setup_lint/runner/__init__.py src/python_setup_lint/runner/__init__.pyi` -> I001x2. Fix is swap RECORD_PARSER_TOOLS before RECORDLESS_TOOLS (ruff --diff confirms). Engine lint gate also reports these 2 plus pre-existing SIM102. Pre-existing SIM102/coverage.py out of scope; I001 is story-introduced and violates VERIFY zero-violations. (src/python_setup_lint/runner/__init__.py)
- [FIX] Dedupe 14-name literal duplicated between test files (R0801): Independent repro: `uv run lint --tools 'pylint tests'` FAILED with R0801 Similar lines in 2 files test_lint_runner:[53:70] vs test_runner_format_contract:[32:47] (14 tool-name lines). Story-new file duplicates the literal. Fix by sharing one literal/helper or narrow justified disable; do not weaken assertions. (tests/runner/test_runner_format_contract.py)
- [FIX] Move usage docstrings from dispatch.py impl to .pyi (W9700x2): Independent repro: `uv run lint --tools 'pylint'` flags W9700 at dispatch.py:177 LintTool.build_format_command and :405 _RuffFormatLintTool (usage docstrings belong in .pyi per CodingRules). Both are story-new. Fix by moving docs to dispatch.pyi / removing impl docstrings. (src/python_setup_lint/runner/dispatch.py)
- [FIX] Resolve new C0302 dispatch.py 542/500 (story pushed over limit): Parent dispatch was 473 lines; story adds ~69 to 542, now flagged by pylint C0302 via `uv run lint --tools 'pylint'`. VERIFY requires zero violations. Fix via split or justified disable with precedent (cf. _factories_extras too-many-lines disable). Pre-existing cli.py R0914 remains out of scope. (src/python_setup_lint/runner/dispatch.py)

- [OPTIONAL] Engine lint gate command omitted ruff format; overall pass misleading: checks.yaml lint sub-gate status=fail but overall gates=status pass; lint command lists 13 tools and omits 'ruff format'. Independently `uv run lint --tools 'ruff format'` PASSED and git status clean, so behavior OK, but gate evidence does not prove full 14-tool lint-clean. No code change; record for engine/operator.
- [OPTIONAL] parsers.pyi 13s are statistics-parser counts, correctly allowlisted: Grep finds 13-built-in-names in parsers.pyi:20,37. These refer to _BUILTIN_PARSE_STRATEGY_TO_PARSER / STATISTICS_PARSER_TOOLS (legitimately 13 with FORMATTER_ONLY exempt), not tool count. No change per assignment allowlist for non-tool-count 13s.
- [OPTIONAL] AGENTS.md test counts stale (1290/7 vs 1352/9), defer to docs-counts-sync: Tool-count migration to 14 verified (AGENTS 9,43,63,92,93; README; overlays; tutorials; troubleshooting; cli help; CHANGELOG:104 correctly stays historical 13). Lines 10-11 test counts (1290 pass, 7 integration) mismatch runtime (1352 passed, 9 integration) but owned by docs-counts-sync follow-up, not this story.

## Check Results


## Current Diff
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..fa462cb
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,58 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (11 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - tests/runner/_factories.py
+        - tests/runner/_factories_extras.py
+        - tests/runner/test_bench_runner_overhead.py
+        - tests/runner/test_extra_tools.py
+        - tests/runner/test_lint_runner.py
+        - tests/runner/test_lint_runner_stats.py
+        - tests/runner/test_real_pipeline_smoke.py
+        - tests/runner/test_self_lint_clean.py
+        - tests/runner/test_t3_coverage.py
+        - tests/runner/test_testing_fakes.py
+        - tests/runner/test_runner_format_contract.py
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 17 expected tests failed with assertion failures"
+    details:
+      command: uv run pytest tests/runner/test_runner_format_contract.py
+        tests/runner/test_lint_runner.py::TestToolSpec
+        tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
+        tests/runner/test_t3_coverage.py::TestParserCompleteness
+        tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-1794135761344-xt8c97z6e5p.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_command_given_normal_pass_then_check_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_default_config_paths_given_ruff_format_then_ruff_toml
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_config_flag_for_ruff_format_then_config_flag
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_expected_tool_names_given_exported_then_matches_builtins
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_formatter_only_and_statistics_parser_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_record_parser_and_recordless_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_then_match_parser_tables
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_given_runner_then_alias_dispatch_objects
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_without_fix_runs_ruff_format_check_only
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_with_fix_formats_first_then_checks
+        - tests.runner.test_runner_format_contract.TestGoldenToolCounts.test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_yamllint_then_default_paths_is_dot
+        - tests.runner.test_lint_runner.TestToolSpec.test_rumdl_default_paths_is_dot
+        - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_parsers_then_correspond_to_tools
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_statistics_flags_then_align_with_parsers
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[fix_flag_propagates_to_supports_fix_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[exclude_flag_propagates_to_supports_exclude_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..5a1ee6c
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,63 @@
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
+  "slug": "runner-format-contract",
+  "kind": "dev",
+  "title": "Ruff format strategy and 14-tool registry fix",
+  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
+  "outlineRef": "runner-format-contract",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1-1",
+    "M1-2",
+    "M1-3"
+  ],
+  "citations": [
+    "AGENTS.md:87-93",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
+  ]
+}
+
+## Context & Citations
+[
+  "AGENTS.md:87-93",
+  "AGENTS.md:121-139",
+  "lint.baseline:1-1"
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
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..169378e
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml
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
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T10:49:25.963Z
+session: 01a1bac7-0329-7335-8f8b-c73c6f308bf5
+endedAt: 2026-11-08T11:02:45.375Z
+usage:
+  inputTokens: 169148
+  outputTokens: 70094
+  costUsd: 0.103653
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T10-49-27-081Z_01a1bac7-0329-7335-8f8b-c73c6f308bf5
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..797e796
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,97 @@
+status: ok
+summary: Authored test-first contract coverage for the ruff-format
+  check-vs-format modes, config wiring, and single-source 14-tool registry, and
+  migrated stale 13-tool assertions to the 14-tool contract. Added
+  tests/runner/test_runner_format_contract.py (ruff format check mode with
+  --check/--config, build_format_command mutating mode, shipped ruff.toml
+  discovery, _config_flag_for mapping,
+  EXPECTED_TOOL_NAMES/FORMATTER_ONLY/STATISTICS_PARSER_TOOLS/RECORD_PARSER_TOOLS/RECORDLESS_TOOLS
+  exports + dispatch ownership, no-fix vs --fix pipeline spying, golden tool
+  counts). Migrated test_lint_runner TestToolSpec (14 names/count),
+  _factories_extras invariant counts derived from EXPECTED_TOOL_NAMES
+  (all_14_tools_dispatched, package_name-none 12), stats/t3 parser-coverage
+  tests to STATISTICS_PARSER_TOOLS with FORMATTER_ONLY exemption, and updated
+  13→14 comments/docstrings in factories, fakes, smoke, self-lint and bench
+  tests. No production files were modified. Full suite is red only on the 17
+  declared target tests (all AssertionError, no collection/import failures);
+  everything else passes.
+target:
+  selectors:
+    - tests/runner/test_runner_format_contract.py
+    - tests/runner/test_lint_runner.py::TestToolSpec
+    - tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
+    - tests/runner/test_t3_coverage.py::TestParserCompleteness
+    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
+  expectRed:
+    - tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_command_given_normal_pass_then_check_mode
+    - tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
+    - tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_default_config_paths_given_ruff_format_then_ruff_toml
+    - tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_config_flag_for_ruff_format_then_config_flag
+    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_expected_tool_names_given_exported_then_matches_builtins
+    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_formatter_only_and_statistics_parser_tools_partition_all_tools
+    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_record_parser_and_recordless_tools_partition_all_tools
+    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_then_match_parser_tables
+    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects
+    - tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_without_fix_runs_ruff_format_check_only
+    - tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_with_fix_formats_first_then_checks
+    - tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
+    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser
+    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_parsers_then_correspond_to_tools
+    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_statistics_flags_then_align_with_parsers
+    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
+    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+evidence:
+  - "Target selector run: `uv run pytest
+    tests/runner/test_runner_format_contract.py
+    tests/runner/test_lint_runner.py::TestToolSpec
+    tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_t\
+    ools_then_covered tests/runner/test_t3_coverage.py::TestParserCompleteness
+    tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invari\
+    ants -q` -> 17 failed, 7 passed; all 17 expectRed ids fail with
+    AssertionError (not import/collection errors)."
+  - "Full suite survey: `uv run pytest -q` -> 17 failed, 1335 passed, 4 skipped,
+    18 deselected; the only failures are the 17 declared target tests."
+  - "Red failure modes verified as behavioral: normal pass ruff format command
+    is ['ruff','format','<path>'] (missing --check/--config);
+    build_format_command absent; _config_flag_for('ruff format', ...) returns
+    []; registry constants not re-exported; run_lint --fix second ruff-format
+    call lacks --check."
+  - "Test infra proof: new tests collect and execute; 12-test contract file
+    reports 11 failed + 1 passed (golden counts guard), and collection lists all
+    expected node ids."
+  - "Golden data verified (not rewritten):
+    tests/data/golden/minimal_sample_project_tool_counts.json has 14 keys, ruff
+    format = 0; the passing
+    test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
+    asserts set(counts) == {t.name for t in TOOLS}."
+  - "Code quality of test changes: `uv run ruff check` on all modified/new tests
+    -> All checks passed; `uv run ruff format --check` -> 11 files already
+    formatted; `uv run mypy tests/runner/test_runner_format_contract.py
+    --no-incremental` -> Success; `uv run pyright
+    tests/runner/test_runner_format_contract.py` -> 0 errors."
+  - "Scope integrity: `git status --porcelain` shows only tests/runner test
+    files modified plus the new tests/runner/test_runner_format_contract.py; no
+    src/, docs/, AGENTS.md, README.md or lint.baseline changes."
+concerns:
+  - Production implementation (RuffFormatLintTool, registry constants, cli
+    phase-1a, docs 13→14 migration) is intentionally out of scope for this
+    test-first step and remains undone; the declared expectRed set is expected
+    to flip green after it lands.
+  - tests/data/tool_counts.json named in the assignment does not exist; the
+    committed golden tests/data/golden/minimal_sample_project_tool_counts.json
+    is the actual artifact and was verified in place without modification.
+  - Fixed a pre-existing pylint C0208 violation in
+    tests/runner/_factories_extras.py (set literal iteration in the fix-flag
+    invariant row) by iterating a tuple, so the later zero-violation lint gate
+    is achievable; this is unrelated to behavior and was in a file already
+    touched.
+  - The new pipeline tests rely on ruff.toml discovery from the repo root
+    (RunnerConfig(cwd=Path.cwd()) with no explicit config_paths), matching the
+    assignment's 'resolved by default' contract; implementation must fall back
+    to _default_config_paths when config_paths lacks 'ruff format'.
+notes: "Test-first only: 17 target tests are red for missing behavior, while the
+  migrated 13→14 count assertions pass against the already-present ruff format
+  ToolSpec. Factory/test counts are derived at runtime from the public
+  EXPECTED_TOOL_NAMES/STATISTICS_PARSER_TOOLS/FORMATTER_ONLY constants via
+  tests.runner._factories.runner_registry_constant, so a missing export fails
+  with a clear AssertionError instead of breaking collection."
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..554ef54
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,234 @@
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
+        durationMs: 653
+        details: 180 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 410961
+        details: |-
+          =============
+          [tach check] PASSED [0.7s]
+          ============================================================
+          Configuration
+          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
+          ✅ All modules validated!
+
+          ============================================================
+          [ruff check] FAILED (exit=1) [0.1s]
+          ============================================================
+          src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single `if` statement instead of nested `if` statements
+          src/python_setup_lint/runner/__init__.py:20:1: I001 [*] Import block is un-sorted or un-formatted
+          src/python_setup_lint/runner/__init__.pyi:20:1: I001 [*] Import block is un-sorted or un-formatted
+          Found 3 errors.
+          [*] 2 fixable with the `--fix` option (1 hidden fix can be enabled with the `--unsafe-fixes` option).
+
+          ============================================================
+          [rumdl check] PASSED [0.1s]
+          ============================================================
+
+          Success: No issues found in 20 files (44ms)
+
+          ============================================================
+          [mypy] PASSED [12.8s]
+          ============================================================
+          Success: no issues found
+          ... [truncated 5307 bytes] ...
+
+          ============================================================
+          [pylint tests] FAILED (exit=8) [36.1s]
+          ============================================================
+          {
+              "messages": [
+                  {
+                      "type": "refactor",
+                      "symbol": "duplicate-code",
+                      "message": "Similar lines in 2 files\n==tests.runner.test_lint_runner:[53:70]\n==tests.runner.test_runner_format_contract:[32:47]\n        \"tach check\",\n        \"ruff format\",\n        \"ruff check\",\n        \"rumdl check\",\n        \"mypy\",\n        \"yamllint\",\n        \"ty check\",\n        \"mypy.stubtest\",\n        \"pyright check\",\n        \"pyright verify types\",\n        \"pylint\",\n        \"pylint-pyi\",\n        \"pylint tests\",\n        \"detect-secrets\",\n    }",
+                      "messageId": "R0801",
+                      "confidence": "UNDEFINED",
+                      "module": "tests.test_setup_precommit",
+                      "obj": "",
+                      "line": 1,
+                      "column": 0,
+                      "endLine": null,
+                      "endColumn": null,
+                      "path": "tests/test_setup_precommit.py",
+                      "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/test_setup_precommit.py"
+                  }
+              ],
+              "statistics": {
+                  "messageTypeCount": {
+                      "fatal": 0,
+                      "error": 0,
+                      "warning": 0,
+                      "refactor": 1,
+                      "convention": 0,
+                      "info": 0
+                  },
+                  "modulesLinted": 74,
+                  "score": 9.998439694180059
+              }
+          }
+
+          ============================================================
+          [detect-secrets] FAILED (exit=123) [79.2s]
+          ============================================================
+          ERROR: Potential secrets about to be committed to git repo!
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:81
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:83
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:204
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:328
+
+          Secret Type: Secret Keyword
+          Location:    .factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230
+
+          Possible mitigations:
+            - For information about putting your secrets in a safer place, please ask in
+              #security
+            - Mark false positives with an inline `pragma: allowlist secret` comment
+
+          If a secret has already been committed, visit
+          https://help.github.com/articles/removing-sensitive-data-from-a-repository
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 57900
+        details: |-
+          [Tach] 1374 tests in 59 files unaffected by changes (~51.3s could be saved). Skip with: pytest --tach
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
+          ........................................................................ [ 53%]
+          ........................................................................ [ 58%]
+          ........................................................................ [ 63%]
+          ........................................................................ [ 69%]
+          ........................................................................ [ 74%]
+          ........................................................................ [ 79%]
+          ........................................................................ [ 84%]
+          ........................................................................ [ 90%]
+          ........................................................................ [ 95%]
+          ............................................................             [100%]
+          =============================== warnings summary ===============================
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
+          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
+            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
+              assert isinstance(node, astroid.NodeNG)
+
+          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
+          1352 passed, 4 skipped, 18 deselected, 4 warnings in 55.36s
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
+        durationMs: 123047
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 121.79s (0:02:01)
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: uv run pytest tests/runner/test_runner_format_contract.py
+        tests/runner/test_lint_runner.py::TestToolSpec
+        tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
+        tests/runner/test_t3_coverage.py::TestParserCompleteness
+        tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-green-1794137769601-9p553taw49j.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_command_given_normal_pass_then_check_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_default_config_paths_given_ruff_format_then_ruff_toml
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_config_flag_for_ruff_format_then_config_flag
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_expected_tool_names_given_exported_then_matches_builtins
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_formatter_only_and_statistics_parser_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_record_parser_and_recordless_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_then_match_parser_tables
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_given_runner_then_alias_dispatch_objects
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_without_fix_runs_ruff_format_check_only
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_with_fix_formats_first_then_checks
+        - tests.runner.test_runner_format_contract.TestGoldenToolCounts.test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_yamllint_then_default_paths_is_dot
+        - tests.runner.test_lint_runner.TestToolSpec.test_rumdl_default_paths_is_dot
+        - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_parsers_then_correspond_to_tools
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_statistics_flags_then_align_with_parsers
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[fix_flag_propagates_to_supports_fix_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[exclude_flag_propagates_to_supports_exclude_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 140/300 production lines changed"
+    details:
+      changedLines:
+        added: 129
+        deleted: 11
+        total: 140
+        files:
+          - src/python_setup_lint/runner/__init__.py
+          - src/python_setup_lint/runner/__init__.pyi
+          - src/python_setup_lint/runner/_config.py
+          - src/python_setup_lint/runner/cli.py
+          - src/python_setup_lint/runner/cmd_build.py
+          - src/python_setup_lint/runner/dispatch.py
+          - src/python_setup_lint/runner/dispatch.pyi
+          - src/python_setup_lint/runner/types.pyi
+      limit: 300
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..426780b
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,89 @@
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
+  "slug": "runner-format-contract",
+  "kind": "dev",
+  "title": "Ruff format strategy and 14-tool registry fix",
+  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
+  "outlineRef": "runner-format-contract",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1-1",
+    "M1-2",
+    "M1-3"
+  ],
+  "citations": [
+    "AGENTS.md:87-93",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "tests/runner/test_runner_format_contract.py",
+    "tests/runner/test_lint_runner.py::TestToolSpec",
+    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
+    "tests/runner/test_t3_coverage.py::TestParserCompleteness",
+    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants"
+  ],
+  "expectRed": [
+    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_command_given_normal_pass_then_check_mode",
+    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode",
+    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_default_config_paths_given_ruff_format_then_ruff_toml",
+    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_config_flag_for_ruff_format_then_config_flag",
+    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_expected_tool_names_given_exported_then_matches_builtins",
+    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_formatter_only_and_statistics_parser_tools_partition_all_tools",
+    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_record_parser_and_recordless_tools_partition_all_tools",
+    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_then_match_parser_tables",
+    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects",
+    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_without_fix_runs_ruff_format_check_only",
+    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_with_fix_formats_first_then_checks",
+    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
+    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser",
+    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_parsers_then_correspond_to_tools",
+    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_statistics_flags_then_align_with_parsers",
+    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]",
+    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]"
+  ]
+}
+
+## Context & Citations
+[
+  "AGENTS.md:87-93",
+  "AGENTS.md:121-139",
+  "lint.baseline:1-1"
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
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..4d9cb79
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
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
+startedAt: 2026-11-08T11:17:04.384Z
+session: 01a1bae0-5192-70f3-9ee7-e13465d6fae5
+endedAt: 2026-11-08T11:36:11.960Z
+usage:
+  inputTokens: 96688
+  outputTokens: 22740
+  costUsd: 0.040778
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T11-17-05-554Z_01a1bae0-5192-70f3-9ee7-e13465d6fae5
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..7ce5c23
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,6 @@
+status: blocked
+summary: Waiting for background gate jobs (full lint and integration) to finish
+  before reporting final status.
+concerns:
+  - Temporary blocked status pending background gate result
+evidence: []
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..6d16dc0
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,69 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 17 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: uv run pytest tests/runner/test_runner_format_contract.py
+        tests/runner/test_lint_runner.py::TestToolSpec
+        tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
+        tests/runner/test_t3_coverage.py::TestParserCompleteness
+        tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
+        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-redtest-1794138504816-jq0mdeoekji.xml
+      junitCaseCount: 24
+      junitCaseIds:
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_command_given_normal_pass_then_check_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_default_config_paths_given_ruff_format_then_ruff_toml
+        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_config_flag_for_ruff_format_then_config_flag
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_expected_tool_names_given_exported_then_matches_builtins
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_formatter_only_and_statistics_parser_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_record_parser_and_recordless_tools_partition_all_tools
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_then_match_parser_tables
+        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_given_runner_then_alias_dispatch_objects
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_without_fix_runs_ruff_format_check_only
+        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_with_fix_formats_first_then_checks
+        - tests.runner.test_runner_format_contract.TestGoldenToolCounts.test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_yamllint_then_default_paths_is_dot
+        - tests.runner.test_lint_runner.TestToolSpec.test_rumdl_default_paths_is_dot
+        - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_parsers_then_correspond_to_tools
+        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_statistics_flags_then_align_with_parsers
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[fix_flag_propagates_to_supports_fix_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[exclude_flag_propagates_to_supports_exclude_labels]
+        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (1 test files, 539 bytes)
+    details:
+      diff: >-
+        diff --git a/tests/runner/test_lint_runner_stats.py
+        b/tests/runner/test_lint_runner_stats.py
+
+        index 4ce4bd4..ff92bb2 100644
+
+        --- a/tests/runner/test_lint_runner_stats.py
+
+        +++ b/tests/runner/test_lint_runner_stats.py
+
+        @@ -221,7 +221,7 @@ class TestT8FailFastConfig:
+         
+         
+         class TestLintToolRegistry:
+        -    """STRATEGIES/LINT_TOOLS mirror the 13 built-ins AND strategies are
+        LintTool instances."""
+
+        +    """STRATEGIES/LINT_TOOLS mirror the 14 built-ins AND strategies are
+        LintTool instances."""
+         
+             @pytest.mark.parametrize(
+                 "registry",
+      files:
+        - tests/runner/test_lint_runner_stats.py
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/input.md b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..3fb5146
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1843 @@
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
+  "slug": "runner-format-contract",
+  "kind": "dev",
+  "title": "Ruff format strategy and 14-tool registry fix",
+  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
+  "outlineRef": "runner-format-contract",
+  "milestone": "M1",
+  "wave": 1,
+  "scenarioRefs": [
+    "M1-1",
+    "M1-2",
+    "M1-3"
+  ],
+  "citations": [
+    "AGENTS.md:87-93",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
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
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..fa462cb
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,58 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (11 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - tests/runner/_factories.py
++        - tests/runner/_factories_extras.py
++        - tests/runner/test_bench_runner_overhead.py
++        - tests/runner/test_extra_tools.py
++        - tests/runner/test_lint_runner.py
++        - tests/runner/test_lint_runner_stats.py
++        - tests/runner/test_real_pipeline_smoke.py
++        - tests/runner/test_self_lint_clean.py
++        - tests/runner/test_t3_coverage.py
++        - tests/runner/test_testing_fakes.py
++        - tests/runner/test_runner_format_contract.py
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 17 expected tests failed with assertion failures"
++    details:
++      command: uv run pytest tests/runner/test_runner_format_contract.py
++        tests/runner/test_lint_runner.py::TestToolSpec
++        tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
++        tests/runner/test_t3_coverage.py::TestParserCompleteness
++        tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
++        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-1794135761344-xt8c97z6e5p.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_command_given_normal_pass_then_check_mode
++        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
++        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_default_config_paths_given_ruff_format_then_ruff_toml
++        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_config_flag_for_ruff_format_then_config_flag
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_expected_tool_names_given_exported_then_matches_builtins
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_formatter_only_and_statistics_parser_tools_partition_all_tools
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_record_parser_and_recordless_tools_partition_all_tools
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_then_match_parser_tables
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_given_runner_then_alias_dispatch_objects
++        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_without_fix_runs_ruff_format_check_only
++        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_with_fix_formats_first_then_checks
++        - tests.runner.test_runner_format_contract.TestGoldenToolCounts.test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_yamllint_then_default_paths_is_dot
++        - tests.runner.test_lint_runner.TestToolSpec.test_rumdl_default_paths_is_dot
++        - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_parsers_then_correspond_to_tools
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_statistics_flags_then_align_with_parsers
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[fix_flag_propagates_to_supports_fix_labels]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[exclude_flag_propagates_to_supports_exclude_labels]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..5a1ee6c
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,63 @@
++# Step: Test-First
++
++## Goal
++Author automated tests specifying the required behavior changes BEFORE writing production code.
++
++## Rules
++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++- Target declaration in yield:
++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++- Output: yield structured output per `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "runner-format-contract",
++  "kind": "dev",
++  "title": "Ruff format strategy and 14-tool registry fix",
++  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
++  "outlineRef": "runner-format-contract",
++  "milestone": "M1",
++  "wave": 1,
++  "scenarioRefs": [
++    "M1-1",
++    "M1-2",
++    "M1-3"
++  ],
++  "citations": [
++    "AGENTS.md:87-93",
++    "AGENTS.md:121-139",
++    "lint.baseline:1-1"
++  ]
++}
++
++## Context & Citations
++[
++  "AGENTS.md:87-93",
++  "AGENTS.md:121-139",
++  "lint.baseline:1-1"
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
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..169378e
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T10:49:25.963Z
++session: 01a1bac7-0329-7335-8f8b-c73c6f308bf5
++endedAt: 2026-11-08T11:02:45.375Z
++usage:
++  inputTokens: 169148
++  outputTokens: 70094
++  costUsd: 0.103653
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T10-49-27-081Z_01a1bac7-0329-7335-8f8b-c73c6f308bf5
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..797e796
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,97 @@
++status: ok
++summary: Authored test-first contract coverage for the ruff-format
++  check-vs-format modes, config wiring, and single-source 14-tool registry, and
++  migrated stale 13-tool assertions to the 14-tool contract. Added
++  tests/runner/test_runner_format_contract.py (ruff format check mode with
++  --check/--config, build_format_command mutating mode, shipped ruff.toml
++  discovery, _config_flag_for mapping,
++  EXPECTED_TOOL_NAMES/FORMATTER_ONLY/STATISTICS_PARSER_TOOLS/RECORD_PARSER_TOOLS/RECORDLESS_TOOLS
++  exports + dispatch ownership, no-fix vs --fix pipeline spying, golden tool
++  counts). Migrated test_lint_runner TestToolSpec (14 names/count),
++  _factories_extras invariant counts derived from EXPECTED_TOOL_NAMES
++  (all_14_tools_dispatched, package_name-none 12), stats/t3 parser-coverage
++  tests to STATISTICS_PARSER_TOOLS with FORMATTER_ONLY exemption, and updated
++  13→14 comments/docstrings in factories, fakes, smoke, self-lint and bench
++  tests. No production files were modified. Full suite is red only on the 17
++  declared target tests (all AssertionError, no collection/import failures);
++  everything else passes.
++target:
++  selectors:
++    - tests/runner/test_runner_format_contract.py
++    - tests/runner/test_lint_runner.py::TestToolSpec
++    - tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
++    - tests/runner/test_t3_coverage.py::TestParserCompleteness
++    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
++  expectRed:
++    - tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_command_given_normal_pass_then_check_mode
++    - tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
++    - tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_default_config_paths_given_ruff_format_then_ruff_toml
++    - tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_config_flag_for_ruff_format_then_config_flag
++    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_expected_tool_names_given_exported_then_matches_builtins
++    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_formatter_only_and_statistics_parser_tools_partition_all_tools
++    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_record_parser_and_recordless_tools_partition_all_tools
++    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_then_match_parser_tables
++    - tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects
++    - tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_without_fix_runs_ruff_format_check_only
++    - tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_with_fix_formats_first_then_checks
++    - tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
++    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser
++    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_parsers_then_correspond_to_tools
++    - tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_statistics_flags_then_align_with_parsers
++    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
++    - tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
++evidence:
++  - "Target selector run: `uv run pytest
++    tests/runner/test_runner_format_contract.py
++    tests/runner/test_lint_runner.py::TestToolSpec
++    tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_t\
++    ools_then_covered tests/runner/test_t3_coverage.py::TestParserCompleteness
++    tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invari\
++    ants -q` -> 17 failed, 7 passed; all 17 expectRed ids fail with
++    AssertionError (not import/collection errors)."
++  - "Full suite survey: `uv run pytest -q` -> 17 failed, 1335 passed, 4 skipped,
++    18 deselected; the only failures are the 17 declared target tests."
++  - "Red failure modes verified as behavioral: normal pass ruff format command
++    is ['ruff','format','<path>'] (missing --check/--config);
++    build_format_command absent; _config_flag_for('ruff format', ...) returns
++    []; registry constants not re-exported; run_lint --fix second ruff-format
++    call lacks --check."
++  - "Test infra proof: new tests collect and execute; 12-test contract file
++    reports 11 failed + 1 passed (golden counts guard), and collection lists all
++    expected node ids."
++  - "Golden data verified (not rewritten):
++    tests/data/golden/minimal_sample_project_tool_counts.json has 14 keys, ruff
++    format = 0; the passing
++    test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
++    asserts set(counts) == {t.name for t in TOOLS}."
++  - "Code quality of test changes: `uv run ruff check` on all modified/new tests
++    -> All checks passed; `uv run ruff format --check` -> 11 files already
++    formatted; `uv run mypy tests/runner/test_runner_format_contract.py
++    --no-incremental` -> Success; `uv run pyright
++    tests/runner/test_runner_format_contract.py` -> 0 errors."
++  - "Scope integrity: `git status --porcelain` shows only tests/runner test
++    files modified plus the new tests/runner/test_runner_format_contract.py; no
++    src/, docs/, AGENTS.md, README.md or lint.baseline changes."
++concerns:
++  - Production implementation (RuffFormatLintTool, registry constants, cli
++    phase-1a, docs 13→14 migration) is intentionally out of scope for this
++    test-first step and remains undone; the declared expectRed set is expected
++    to flip green after it lands.
++  - tests/data/tool_counts.json named in the assignment does not exist; the
++    committed golden tests/data/golden/minimal_sample_project_tool_counts.json
++    is the actual artifact and was verified in place without modification.
++  - Fixed a pre-existing pylint C0208 violation in
++    tests/runner/_factories_extras.py (set literal iteration in the fix-flag
++    invariant row) by iterating a tuple, so the later zero-violation lint gate
++    is achievable; this is unrelated to behavior and was in a file already
++    touched.
++  - The new pipeline tests rely on ruff.toml discovery from the repo root
++    (RunnerConfig(cwd=Path.cwd()) with no explicit config_paths), matching the
++    assignment's 'resolved by default' contract; implementation must fall back
++    to _default_config_paths when config_paths lacks 'ruff format'.
++notes: "Test-first only: 17 target tests are red for missing behavior, while the
++  migrated 13→14 count assertions pass against the already-present ruff format
++  ToolSpec. Factory/test counts are derived at runtime from the public
++  EXPECTED_TOOL_NAMES/STATISTICS_PARSER_TOOLS/FORMATTER_ONLY constants via
++  tests.runner._factories.runner_registry_constant, so a missing export fails
++  with a clear AssertionError instead of breaking collection."
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..554ef54
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,234 @@
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
++        durationMs: 653
++        details: 180 files already formatted
++      - id: lint
++        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
++          check,mypy.stubtest,pyright check,pyright verify
++          types,pylint,pylint-pyi,pylint tests,detect-secrets'
++        status: fail
++        durationMs: 410961
++        details: |-
++          =============
++          [tach check] PASSED [0.7s]
++          ============================================================
++          Configuration
++          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
++          ✅ All modules validated!
++
++          ============================================================
++          [ruff check] FAILED (exit=1) [0.1s]
++          ============================================================
++          src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single `if` statement instead of nested `if` statements
++          src/python_setup_lint/runner/__init__.py:20:1: I001 [*] Import block is un-sorted or un-formatted
++          src/python_setup_lint/runner/__init__.pyi:20:1: I001 [*] Import block is un-sorted or un-formatted
++          Found 3 errors.
++          [*] 2 fixable with the `--fix` option (1 hidden fix can be enabled with the `--unsafe-fixes` option).
++
++          ============================================================
++          [rumdl check] PASSED [0.1s]
++          ============================================================
++
++          Success: No issues found in 20 files (44ms)
++
++          ============================================================
++          [mypy] PASSED [12.8s]
++          ============================================================
++          Success: no issues found
++          ... [truncated 5307 bytes] ...
++
++          ============================================================
++          [pylint tests] FAILED (exit=8) [36.1s]
++          ============================================================
++          {
++              "messages": [
++                  {
++                      "type": "refactor",
++                      "symbol": "duplicate-code",
++                      "message": "Similar lines in 2 files\n==tests.runner.test_lint_runner:[53:70]\n==tests.runner.test_runner_format_contract:[32:47]\n        \"tach check\",\n        \"ruff format\",\n        \"ruff check\",\n        \"rumdl check\",\n        \"mypy\",\n        \"yamllint\",\n        \"ty check\",\n        \"mypy.stubtest\",\n        \"pyright check\",\n        \"pyright verify types\",\n        \"pylint\",\n        \"pylint-pyi\",\n        \"pylint tests\",\n        \"detect-secrets\",\n    }",
++                      "messageId": "R0801",
++                      "confidence": "UNDEFINED",
++                      "module": "tests.test_setup_precommit",
++                      "obj": "",
++                      "line": 1,
++                      "column": 0,
++                      "endLine": null,
++                      "endColumn": null,
++                      "path": "tests/test_setup_precommit.py",
++                      "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/test_setup_precommit.py"
++                  }
++              ],
++              "statistics": {
++                  "messageTypeCount": {
++                      "fatal": 0,
++                      "error": 0,
++                      "warning": 0,
++                      "refactor": 1,
++                      "convention": 0,
++                      "info": 0
++                  },
++                  "modulesLinted": 74,
++                  "score": 9.998439694180059
++              }
++          }
++
++          ============================================================
++          [detect-secrets] FAILED (exit=123) [79.2s]
++          ============================================================
++          ERROR: Potential secrets about to be committed to git repo!
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:81
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:83
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:204
++
++          Secret Type: Hex High Entropy String
++          Location:    .factory/tasks/modernize/journal.ndjson:328
++
++          Secret Type: Secret Keyword
++          Location:    .factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230
++
++          Possible mitigations:
++            - For information about putting your secrets in a safer place, please ask in
++              #security
++            - Mark false positives with an inline `pragma: allowlist secret` comment
++
++          If a secret has already been committed, visit
++          https://help.github.com/articles/removing-sensitive-data-from-a-repository
++
++          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/config/.pylintrc
++      - id: test
++        command: uv run pytest -q
++        status: pass
++        durationMs: 57900
++        details: |-
++          [Tach] 1374 tests in 59 files unaffected by changes (~51.3s could be saved). Skip with: pytest --tach
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
++          ........................................................................ [ 53%]
++          ........................................................................ [ 58%]
++          ........................................................................ [ 63%]
++          ........................................................................ [ 69%]
++          ........................................................................ [ 74%]
++          ........................................................................ [ 79%]
++          ........................................................................ [ 84%]
++          ........................................................................ [ 90%]
++          ........................................................................ [ 95%]
++          ............................................................             [100%]
++          =============================== warnings summary ===============================
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[classvar_skipped]
++          tests/checkers/test_stub_checker.py::test_is_classvar_given_expression_then_expected_bool[non_classvar]
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_checker.py:410: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_classvar_annotation_then_true
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_fidelity_invariants.py:258: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          tests/checkers/test_stub_fidelity_invariants.py::TestClassVarSkipInvariants::test_is_classvar_given_regular_annotation_then_false
++            /home/slava/aiexp/python-setup.factory-wt/topic_modernize--runner-format-contract/tests/checkers/test_stub_fidelity_invariants.py:263: DeprecationWarning: importing 'NodeNG' from 'astroid' is deprecated and will be removed in v5, import it from 'astroid.nodes' instead
++              assert isinstance(node, astroid.NodeNG)
++
++          -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
++          1352 passed, 4 skipped, 18 deselected, 4 warnings in 55.36s
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
++        durationMs: 123047
++        details: |-
++          [Tach] 9 tests in 4 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
++          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
++          .........                                                                [100%]
++          9 passed in 121.79s (0:02:01)
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: uv run pytest tests/runner/test_runner_format_contract.py
++        tests/runner/test_lint_runner.py::TestToolSpec
++        tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered
++        tests/runner/test_t3_coverage.py::TestParserCompleteness
++        tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants
++        --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-green-1794137769601-9p553taw49j.xml
++      junitCaseCount: 24
++      junitCaseIds:
++        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_command_given_normal_pass_then_check_mode
++        - tests.runner.test_runner_format_contract.TestRuffFormatStrategy.test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode
++        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_default_config_paths_given_ruff_format_then_ruff_toml
++        - tests.runner.test_runner_format_contract.TestRuffFormatConfig.test_config_flag_for_ruff_format_then_config_flag
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_expected_tool_names_given_exported_then_matches_builtins
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_formatter_only_and_statistics_parser_tools_partition_all_tools
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_record_parser_and_recordless_tools_partition_all_tools
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_then_match_parser_tables
++        - tests.runner.test_runner_format_contract.TestRegistryConstants.test_registry_constants_given_runner_then_alias_dispatch_objects
++        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_without_fix_runs_ruff_format_check_only
++        - tests.runner.test_runner_format_contract.TestPipelineModes.test_run_lint_with_fix_formats_first_then_checks
++        - tests.runner.test_runner_format_contract.TestGoldenToolCounts.test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
++        - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_yamllint_then_default_paths_is_dot
++        - tests.runner.test_lint_runner.TestToolSpec.test_rumdl_default_paths_is_dot
++        - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_parsers_then_correspond_to_tools
++        - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_statistics_flags_then_align_with_parsers
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[fix_flag_propagates_to_supports_fix_labels]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[exclude_flag_propagates_to_supports_exclude_labels]
++        - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 140/300 production lines changed"
++    details:
++      changedLines:
++        added: 129
++        deleted: 11
++        total: 140
++        files:
++          - src/python_setup_lint/runner/__init__.py
++          - src/python_setup_lint/runner/__init__.pyi
++          - src/python_setup_lint/runner/_config.py
++          - src/python_setup_lint/runner/cli.py
++          - src/python_setup_lint/runner/cmd_build.py
++          - src/python_setup_lint/runner/dispatch.py
++          - src/python_setup_lint/runner/dispatch.pyi
++          - src/python_setup_lint/runner/types.pyi
++      limit: 300
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..426780b
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,89 @@
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
++  "slug": "runner-format-contract",
++  "kind": "dev",
++  "title": "Ruff format strategy and 14-tool registry fix",
++  "assignment": "GOAL: Retain 14 tools with explicit check-vs-format modes per ADR-005 and single-sourced registry. SCOPE FILES: src/python_setup_lint/runner/dispatch.py, src/python_setup_lint/runner/_config.py, src/python_setup_lint/runner/__init__.py, src/python_setup_lint/runner/cli.py, AGENTS.md, README.md, docs/overlays.md, docs/tutorials.md, docs/troubleshooting.md, tests/runner/_factories.py, tests/runner/_factories_extras.py, tests/runner/test_lint_runner.py, tests/runner/test_extra_tools.py, tests/test_self_lint_clean.py, tests/runner/test_bench_runner_overhead.py, tests/runner/test_real_pipeline_smoke.py, tests/runner/test_testing_fakes.py, tests/data/tool_counts.json (verify only). STEPS: (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command(config,path,exclude) returns check mode [ruff,format,--check,--config,<resolved ruff.toml>,...paths] by default; build_format_command returns mutating mode without --check; register in _strategy_for; map ruff format to ruff.toml in _config.py plus _config_flag_for; cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command; no if-spec.name in _build_command. (2) Registry owned by dispatch.py re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY with ruff format, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS with tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format documented intentional; migrate 6 named tests (test_lint_runner set+count 13 to 14, _factories_extras len+id, stats plus t3 to STATISTICS set with FORMATTER_ONLY exemption, fakes invariants to EXPECTED set); tests import from python_setup_lint.runner. (3) Docs migration to 14 with per-hit report via grep 13-tools pattern: AGENTS.md lines 9,43,63,92,93 plus counts table 10-11, README 17,58, overlays 3, tutorials 26, troubleshooting 155, runner __init__ 3, cli 314, _factories 46, _factories_extras 1,377-378, test_lint_runner 50,76, test_extra_tools 237, test_self_lint_clean 3, test_bench 5,224, test_real_pipeline 24, test_testing_fakes 137,165 plus any further grep hit; CHANGELOG 104 stays 13 historical; allowlist MD013,130,v0.13 and non-tool-count 13s; assert tool_counts.json already 14 keys incl ruff format 0 (verify not rewrite). VERIFY: format gate exit 0, lint gate zero violations in src and tests, pytest -q exit 0, integration exit 0, git status --porcelain empty after uv run lint without --fix, spy shows normal-pass ruff-format cmd contains --check and --config with resolved existing path (composed temp accepted, no literal match) and mutating cmd runs only under --fix without --check, golden byte-identical, lint.baseline stays []. CONSTRAINTS: dev kind, test-first for behavior; prod budget about 60 lines.",
++  "outlineRef": "runner-format-contract",
++  "milestone": "M1",
++  "wave": 1,
++  "scenarioRefs": [
++    "M1-1",
++    "M1-2",
++    "M1-3"
++  ],
++  "citations": [
++    "AGENTS.md:87-93",
++    "AGENTS.md:121-139",
++    "lint.baseline:1-1"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "tests/runner/test_runner_format_contract.py",
++    "tests/runner/test_lint_runner.py::TestToolSpec",
++    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
++    "tests/runner/test_t3_coverage.py::TestParserCompleteness",
++    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants"
++  ],
++  "expectRed": [
++    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_command_given_normal_pass_then_check_mode",
++    "tests/runner/test_runner_format_contract.py::TestRuffFormatStrategy::test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode",
++    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_default_config_paths_given_ruff_format_then_ruff_toml",
++    "tests/runner/test_runner_format_contract.py::TestRuffFormatConfig::test_config_flag_for_ruff_format_then_config_flag",
++    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_expected_tool_names_given_exported_then_matches_builtins",
++    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_formatter_only_and_statistics_parser_tools_partition_all_tools",
++    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_record_parser_and_recordless_tools_partition_all_tools",
++    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_then_match_parser_tables",
++    "tests/runner/test_runner_format_contract.py::TestRegistryConstants::test_registry_constants_given_runner_then_alias_dispatch_objects",
++    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_without_fix_runs_ruff_format_check_only",
++    "tests/runner/test_runner_format_contract.py::TestPipelineModes::test_run_lint_with_fix_formats_first_then_checks",
++    "tests/runner/test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered",
++    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser",
++    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_parsers_then_correspond_to_tools",
++    "tests/runner/test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_statistics_flags_then_align_with_parsers",
++    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_14_tools_dispatched]",
++    "tests/runner/test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]"
++  ]
++}
++
++## Context & Citations
++[
++  "AGENTS.md:87-93",
++  "AGENTS.md:121-139",
++  "lint.baseline:1-1"
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
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..4d9cb79
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T11:17:04.384Z
++session: 01a1bae0-5192-70f3-9ee7-e13465d6fae5
++endedAt: 2026-11-08T11:36:11.960Z
++usage:
++  inputTokens: 96688
++  outputTokens: 22740
++  costUsd: 0.040778
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T11-17-05-554Z_01a1bae0-5192-70f3-9ee7-e13465d6fae5
+diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..7ce5c23
+--- /dev/null
++++ b/.factory/tasks/modernize/items/runner-format-contract/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,6 @@
++status: blocked
++summary: Waiting for background gate jobs (full lint and integration) to finish
++  before reporting final status.
++concerns:
++  - Temporary blocked status pending background gate result
++evidence: []
+diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
+index af4679f..1140334 100644
+--- a/.factory/tasks/modernize/journal.ndjson
++++ b/.factory/tasks/modernize/journal.ndjson
+@@ -780,10 +780,3 @@
+ {"type":"step_timeout_armed","task":"modernize","step":"pm-edits-2","timeoutSec":900,"ts":"2026-11-08T10:48:49.821Z"}
+ {"type":"step_finished","task":"modernize","step":"pm-edits-2","attempt":2,"status":"ok","sessionId":"01a1bac4-cb04-7739-a895-0f6b72ed4e68","usage":{"inputTokens":5421,"outputTokens":6336,"costUsd":0.001903},"ts":"2026-11-08T10:49:19.949Z"}
+ {"type":"pm_edits_repaired","errors":[],"ts":"2026-11-08T10:49:19.949Z"}
+-{"type":"lock_takeover","task":"modernize","previousPid":3533107,"previousHost":"Slava-Yoga","newPid":69767,"newHost":"Slava-Yoga","ts":"2026-11-08T11:46:55.654Z"}
+-{"type":"task_started","task":"modernize","branch":"topic/modernize","ts":"2026-11-08T11:46:55.655Z"}
+-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:46:58.497Z"}
+-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:47:03.113Z"}
+-{"type":"steer_processed","file":"1794100866341.md","classification":{"refs":["plan-1","awareness-plan-1-material-definition-needs-awareness","awareness-plan-1-cache-file-needs-awareness","awareness-plan-1-never-linting-policy-needs-awareness"],"kind":"answer","urgency":"next-architect-call","summary":"Operator accepts all three plan-1 awareness items (material definition, git-stored cache at linted root, never-test-linting broadening) as intentional; no further action, no regressions assumed."},"ts":"2026-11-08T11:48:08.343Z"}
+-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:48:10.744Z"}
+-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:48:13.181Z"}
+diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md b/.factory/tasks/modernize/steer/fromuserpending/1794100866341.md
+similarity index 100%
+rename from .factory/tasks/modernize/steer/fromusertaken/1794100866341.md
+rename to .factory/tasks/modernize/steer/fromuserpending/1794100866341.md
+diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md b/.factory/tasks/modernize/steer/fromuserpending/1794128584028.md
+similarity index 100%
+rename from .factory/tasks/modernize/steer/fromusertaken/1794128584028.md
+rename to .factory/tasks/modernize/steer/fromuserpending/1794128584028.md
+diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml b/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml
+deleted file mode 100644
+index e1bf450..0000000
+--- a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml
++++ /dev/null
+@@ -1,10 +0,0 @@
+-refs:
+-  - plan-1
+-  - awareness-plan-1-material-definition-needs-awareness
+-  - awareness-plan-1-cache-file-needs-awareness
+-  - awareness-plan-1-never-linting-policy-needs-awareness
+-kind: answer
+-urgency: next-architect-call
+-summary: Operator accepts all three plan-1 awareness items (material definition,
+-  git-stored cache at linted root, never-test-linting broadening) as
+-  intentional; no further action, no regressions assumed.
+diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml b/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml
+deleted file mode 100644
+index e1648a4..0000000
+--- a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml
++++ /dev/null
+@@ -1,8 +0,0 @@
+-refs:
+-  - awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup
+-  - consolidate-integration-helpers-v2
+-kind: answer
+-urgency: next-architect-call
+-summary: Approves follow-up docs/prod story (small dev kind, depends on v3 line)
+-  to sync AGENTS.md counts and cli.py:314 help text, foldable into pending
+-  docs-counts-sync story; pre-existing baseline reds stay out of story budgets.
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
+index f11cbf0..2879adf 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
+@@ -10,15 +10,5 @@ question: Assignment named this story sole AGENTS.md counts owner, but
+   lint` stays red on pre-existing base failures (SIM102, R0914, C0208,
+   orchestration-journal detect-secrets) outside this story's budget; all files
+   touched here are ruff/format clean.
+-status: answered
++status: open
+ createdAt: 2026-11-08T07:10:59.798Z
+-answer: >
+-  Operator acknowledges
+-  awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup:
+-  restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct
+-  (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md
+-  counts and the cli help text is approved — add it (small dev kind, depends on
+-  the v3 line) when the wave-report next amends, or fold the two-line sync into
+-  the docs-counts-sync story if it is still pending. Pre-existing red lint/test
+-  baseline items stay out of story budgets. No other action.
+-answeredAt: 2026-11-08T11:48:21.642Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
+index 5e38feb..dc60cf3 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
+@@ -5,15 +5,5 @@ question: Committed file in every linted repo (incl. consumers) with reviewable
+   diffs and possible branch conflicts. Weights 0.03-0.8GB in model cache with
+   own licenses. Install docs must mention file. Architect decides now; operator
+   should be aware of footprint and license review.
+-status: answered
++status: open
+ createdAt: 2026-11-08T00:51:56.276Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.286Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
+index 68b67ff..4a3fcb6 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
+@@ -6,15 +6,5 @@ question: Assumption + ADR-003 place git-stored cache at linted root for
+   file per consumer, reviewable diffs, possible line-local merges, must pass
+   detect-secrets. Architect can proceed; operator should be aware before epic
+   implements.
+-status: answered
++status: open
+ createdAt: 2026-11-08T01:06:40.589Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.293Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
+index 77784e2..d6d2afe 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
+@@ -6,15 +6,5 @@ question: Assumption defines material as findings {tool,file,line,col,rule}
+   model accept/reject non-material, heuristic rejections material. Makes
+   preserve testable but narrows intent. Architect can proceed for iter1; record
+   for operator review.
+-status: answered
++status: open
+ createdAt: 2026-11-08T01:06:40.587Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.291Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
+index ffd7c18..e35fa23 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
+@@ -6,15 +6,5 @@ question: Assumption expands never-test-linting to ban subprocess re-lint,
+   test_self_lint_clean.py slow gate, guards, config re-checks). M3 lists for
+   removal, iter2 removes. Rationale (rot with rule churn) reasonable but deletes
+   coverage; operator visibility warranted.
+-status: answered
++status: open
+ createdAt: 2026-11-08T01:06:40.590Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.289Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
+index b1ee1c1..3d8fff6 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
+@@ -5,15 +5,5 @@ question: Assumption defines 4 limbs; reranker decisions not material, heuristic
+   rejections material. Model 'only tightens acceptance' may add W9704 under
+   default SEMANTIC=1 vs today heuristic-only. Architect decides now; operator
+   should know tightening is intentional, not regression.
+-status: answered
++status: open
+ createdAt: 2026-11-08T00:51:56.275Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.281Z
+diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
+index 556ddab..114db9d 100644
+--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
++++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
+@@ -5,15 +5,5 @@ question: Policy 'pytest never asserts lint-clean; lint gate does' removes
+   self-lint guard running all 13 tools on repo. Trades pytest redundancy for
+   gate reliance. Architect decides now; operator should know pytest -q alone
+   will no longer catch self-lint regressions.
+-status: answered
++status: open
+ createdAt: 2026-11-08T00:51:56.276Z
+-answer: >
+-  Operator acknowledges all plan-1 awareness items: (1) material definition and
+-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
+-  intentional, not a regression. (2) git-stored cache file at the linted repo
+-  root: OK as required by INTENT; document it in install docs, keep it
+-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
+-  broadening and removing the pytest self-lint guard: OK, it matches the
+-  project's coding rules; the lint gate is the guard. No further action needed
+-  on these.
+-answeredAt: 2026-11-08T11:48:08.294Z
+diff --git a/AGENTS.md b/AGENTS.md
+index ae3db45..0256866 100644
+--- a/AGENTS.md
++++ b/AGENTS.md
+@@ -6,7 +6,7 @@ This file is the entry point for all AI agents working on python-setup. Read thi
+ 
+ | Command | What it does |
+ |---------|-------------|
+- | `uv run lint` | Full 13-tool lint pipeline (baseline diffing, ~100s warm, 120s/tool cap) |
++ | `uv run lint` | Full 14-tool lint pipeline (baseline diffing, ~100s warm, 120s/tool cap) |
+  | `uv run pytest -q` | Unit tests (1290 pass, 4 skip, 15 deselected, ~53s) |
+  | `uv run pytest tests/integration.py -v` | Integration tests (7 pass, ~30s) |
+ | `uv run lint --overwrite-baseline --baseline lint.baseline` | Regenerate `lint.baseline` after intentional rule changes |
+@@ -40,7 +40,7 @@ This file is the entry point for all AI agents working on python-setup. Read thi
+ | `CodingRules.md` | Python coding conventions (shipped to consumers) |
+ | `lint.baseline` | Frozen baseline of pre-existing violations |
+ | `src/python_setup_lint/runner/cli.py` | Main entry point (`main`, `run_lint`) |
+-| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry (13 built-in tools) |
++| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry (14 built-in tools) |
+ | `src/python_setup_lint/checkers/_base.py` | Shared checker utilities |
+ | `tests/conftest.py` | Shared pytest fixtures |
+ | `tests/integration.py` | Fit-for-purpose integration test |
+@@ -60,7 +60,7 @@ pyproject.toml → ToolSpec[] → dispatch.run() → per-tool subprocess → res
+ Each tool is a `ToolSpec` with name, command, args, config path, and parse strategy. The runner:
+ 
+ 1. Loads `pyproject.toml` for extra tools and config overrides
+-2. Builds the tool list (13 built-in + any extras)
++2. Builds the tool list (14 built-in + any extras)
+ 3. Runs each tool sequentially (some tools share resources)
+ 4. Parses output per-tool (regex, JSON, lines)
+ 5. Filters against `lint.baseline` (only new violations fail)
+@@ -89,8 +89,8 @@ The semantic checker (W9704) detects `Any` in function signatures, unjustified s
+ | Layer | Command | Scope |
+ |-------|---------|-------|
+ | Unit | `uv run pytest -q` | Individual checkers, runner logic, config parsing |
+-| Integration | `uv run pytest tests/integration.py -v` | End-to-end: install, lint, update on a sample project. Validates ALL 13 tools + custom checkers fire on planted violations; NOT marked slow; key fit-for-purpose gate. |
+-| Lint | `uv run lint` | Self-lint: all 13 tools on python-setup itself |
++| Integration | `uv run pytest tests/integration.py -v` | End-to-end: install, lint, update on a sample project. Validates ALL 14 tools + custom checkers fire on planted violations; NOT marked slow; key fit-for-purpose gate. |
++| Lint | `uv run lint` | Self-lint: all 14 tools on python-setup itself |
+ 
+ ## Common Patterns
+ 
+diff --git a/README.md b/README.md
+index a180b8a..48be719 100644
+--- a/README.md
++++ b/README.md
+@@ -14,7 +14,7 @@ uv run lint
+ 
+ A reusable Python project template that ships:
+ 
+-- **13 lint tools** — tach, ruff, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright (check + verify types), pylint, pylint-pyi, pylint tests, detect-secrets.
++- **14 lint tools** — tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright (check + verify types), pylint, pylint-pyi, pylint tests, detect-secrets.
+ - **Shared config** — tool configs live in `python-setup/config/` and are inherited by consumer projects.
+ - **Custom pylint checkers** — automatically registered; no manual plugin loading.
+ - **Baseline diffing** — `lint.baseline` freezes pre-existing violations; CI only flags new ones.
+@@ -55,7 +55,7 @@ Override any shared config via `pyproject.toml` `[tool.*]` sections. See [docs/o
+ uv run lint
+ ```
+ 
+-Runs all 13 lint tools sequentially with baseline diffing and statistics aggregation.
++Runs all 14 lint tools sequentially with baseline diffing and statistics aggregation.
+ 
+ ### What you get
+ 
+diff --git a/docs/overlays.md b/docs/overlays.md
+index c985e01..fb33411 100644
+--- a/docs/overlays.md
++++ b/docs/overlays.md
+@@ -1,6 +1,6 @@
+ # Rule Overlay Configuration
+ 
+-Consumer projects can overlay their own rules on the shared base config. Each tool has its own mechanism — this document covers all 13 shipped tools.
++Consumer projects can overlay their own rules on the shared base config. Each tool has its own mechanism — this document covers all 14 shipped tools.
+ 
+ ## Per-tool overlay reference
+ 
+diff --git a/docs/troubleshooting.md b/docs/troubleshooting.md
+index 3456dd6..7d4049f 100644
+--- a/docs/troubleshooting.md
++++ b/docs/troubleshooting.md
+@@ -152,7 +152,7 @@ uv run pytest tests/integration.py -v
+ 
+ **What it covers:**
+ 
+-- All 13 lint tools fire on planted violations
++- All 14 lint tools fire on planted violations
+ - Config overlays work
+ - Setup is idempotent
+ - Pre-commit hooks validate
+diff --git a/docs/tutorials.md b/docs/tutorials.md
+index 536e65c..b21b17f 100644
+--- a/docs/tutorials.md
++++ b/docs/tutorials.md
+@@ -23,7 +23,7 @@ See [troubleshooting.md](troubleshooting.md) if `uv run python-setup install` fa
+ uv run lint
+ ```
+ 
+-Runs all 13 lint tools sequentially. On a fresh project the first run may produce violations — that's expected.
++Runs all 14 lint tools sequentially. On a fresh project the first run may produce violations — that's expected.
+ 
+ ## 3. Read output
+ 
+diff --git a/src/python_setup_lint/runner/__init__.py b/src/python_setup_lint/runner/__init__.py
+index 35ae08a..ecf01b5 100644
+--- a/src/python_setup_lint/runner/__init__.py
++++ b/src/python_setup_lint/runner/__init__.py
+@@ -1,6 +1,6 @@
+ """Python CLI runner for the python-setup lint pipeline.
+ 
+-Replaces ``scripts/lint.sh``.  Runs all 13 lint steps sequentially with
++Replaces ``scripts/lint.sh``.  Runs all 14 lint steps sequentially with
+ optional path scoping, fix mode, baseline diffing, flexible failure
+ handling, statistics aggregation, declarative extra-tools (T11 v1), and
+ autofix (T4).  See ``AGENTS.md`` for the full architecture.
+@@ -22,7 +22,12 @@ from __future__ import annotations
+ from .baseline import peek_fallback_tools
+ from .cli import main, run_lint
+ from .dispatch import (
++    EXPECTED_TOOL_NAMES,
++    FORMATTER_ONLY,
+     LINT_TOOLS,
++    RECORDLESS_TOOLS,
++    RECORD_PARSER_TOOLS,
++    STATISTICS_PARSER_TOOLS,
+     STRATEGIES,
+     TOOLS,
+     TOOLS_BY_NAME,
+@@ -35,8 +40,13 @@ from .parsers import PARSE_STRATEGIES, Record
+ from .types import LintResult, RunnerConfig, ToolSpec, ViolationCount
+ 
+ __all__ = [
++    "EXPECTED_TOOL_NAMES",
++    "FORMATTER_ONLY",
+     "LINT_TOOLS",
+     "PARSE_STRATEGIES",
++    "RECORDLESS_TOOLS",
++    "RECORD_PARSER_TOOLS",
++    "STATISTICS_PARSER_TOOLS",
+     "STRATEGIES",
+     "TOOLS",
+     "TOOLS_BY_NAME",
+diff --git a/src/python_setup_lint/runner/__init__.pyi b/src/python_setup_lint/runner/__init__.pyi
+index 20a5008..0729461 100644
+--- a/src/python_setup_lint/runner/__init__.pyi
++++ b/src/python_setup_lint/runner/__init__.pyi
+@@ -1,6 +1,6 @@
+ """Python CLI runner for the python-setup lint pipeline.
+ 
+-Replaces ``scripts/lint.sh``.  Runs all 13 lint steps sequentially with
++Replaces ``scripts/lint.sh``.  Runs all 14 lint steps sequentially with
+ optional path scoping, fix mode, baseline diffing, flexible failure
+ handling, statistics aggregation, declarative extra-tools (T11 v1), and
+ autofix (T4).  See ``AGENTS.md`` for the full architecture.
+@@ -20,7 +20,12 @@ Public surface
+ from .baseline import peek_fallback_tools
+ from .cli import main, run_lint
+ from .dispatch import (
++    EXPECTED_TOOL_NAMES,
++    FORMATTER_ONLY,
+     LINT_TOOLS,
++    RECORDLESS_TOOLS,
++    RECORD_PARSER_TOOLS,
++    STATISTICS_PARSER_TOOLS,
+     STRATEGIES,
+     TOOLS,
+     TOOLS_BY_NAME,
+@@ -33,8 +38,13 @@ from .parsers import PARSE_STRATEGIES, Record
+ from .types import LintResult, RunnerConfig, ToolSpec, ViolationCount
+ 
+ __all__ = [
++    "EXPECTED_TOOL_NAMES",
++    "FORMATTER_ONLY",
+     "LINT_TOOLS",
+     "PARSE_STRATEGIES",
++    "RECORDLESS_TOOLS",
++    "RECORD_PARSER_TOOLS",
++    "STATISTICS_PARSER_TOOLS",
+     "STRATEGIES",
+     "TOOLS",
+     "TOOLS_BY_NAME",
+diff --git a/src/python_setup_lint/runner/_config.py b/src/python_setup_lint/runner/_config.py
+index 6493b31..2382050 100644
+--- a/src/python_setup_lint/runner/_config.py
++++ b/src/python_setup_lint/runner/_config.py
+@@ -7,6 +7,7 @@ from pathlib import Path
+ # Each key is the canonical tool label used in ``_config_flag_for``.
+ _SHIPPED_CONFIG_FILES: dict[str, str] = {
+     "ruff check": "ruff.toml",
++    "ruff format": "ruff.toml",
+     "mypy": "mypy.ini",
+     "pylint": ".pylintrc",
+     "pylint tests": ".pylintrc-tests",
+diff --git a/src/python_setup_lint/runner/cli.py b/src/python_setup_lint/runner/cli.py
+index 3528e47..a1c636c 100644
+--- a/src/python_setup_lint/runner/cli.py
++++ b/src/python_setup_lint/runner/cli.py
+@@ -25,6 +25,7 @@ from ._cli_complexity import (
+ )
+ from ._cli_helpers import _handle_baseline, _print_tool_notes
+ from .dispatch import (
++    FORMATTER_ONLY,
+     _strategy_for,  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
+ )
+ from .extra_tools import (
+@@ -72,11 +73,11 @@ def _run_tool_pipeline(
+     if fix and not statistics:
+         # ── Phase 1a: format pass (ruff format before fix tools) ──
+         for spec in selected:
+-            if spec.name != "ruff format":
++            if spec.name not in FORMATTER_ONLY:
+                 continue
+             _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
+             strategy = _strategy_for(spec.name, spec)
+-            cmd = strategy.build_command(config=config, _fix=False, _path=path, _exclude=exclude)
++            cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
+             result = _run_cmd(cmd, cwd=cwd, label=spec.name)
+             _print_result(result)
+             if result.exit_code != 0:
+@@ -311,7 +312,7 @@ def main(argv: list[str] | None = None, *, config: RunnerConfig | None = None) -
+     parser.add_argument(
+         "--tools",
+         metavar="LIST",
+-        help="Comma-separated tool names to run (default: all 13 tools)",
++        help="Comma-separated tool names to run (default: all 14 tools)",
+     )
+     parser.add_argument(
+         "--default-py-dirs",
+diff --git a/src/python_setup_lint/runner/cmd_build.py b/src/python_setup_lint/runner/cmd_build.py
+index f043726..7d9030e 100644
+--- a/src/python_setup_lint/runner/cmd_build.py
++++ b/src/python_setup_lint/runner/cmd_build.py
+@@ -12,6 +12,7 @@ if TYPE_CHECKING:
+ 
+ __all__ = [
+     "_build_command",
++    "_build_path_and_exclude_args",
+     "_build_statistics_flags",
+     "_compose_pyright_config",
+     "_compose_ruff_config",
+@@ -109,6 +110,7 @@ def _config_flag_for(spec_name: str, config_path: Path | None) -> list[str]:
+         return []
+     flags: dict[str, list[str]] = {
+         "ruff check": ["--config", str(config_path)],
++        "ruff format": ["--config", str(config_path)],
+         "mypy": ["--config-file", str(config_path)],
+         "pylint": ["--rcfile", str(config_path)],
+         "pyright check": ["--project", str(config_path)],
+diff --git a/src/python_setup_lint/runner/dispatch.py b/src/python_setup_lint/runner/dispatch.py
+index 428076a..3476da3 100644
+--- a/src/python_setup_lint/runner/dispatch.py
++++ b/src/python_setup_lint/runner/dispatch.py
+@@ -8,17 +8,23 @@ from beartype import beartype
+ from ._config import _default_config_paths
+ from .cmd_build import (
+     _build_command,
++    _build_path_and_exclude_args,
+     _build_statistics_flags,
+     _config_flag_for,
+     _find_py_files,
+     _find_pyi_files,
+     _resolve_pylintrc,
+ )
+-from .parsers import _STATISTICS_PARSERS
++from .parsers import _RECORD_PARSERS, _STATISTICS_PARSERS
+ from .types import RunnerConfig, ToolSpec
+ 
+ __all__ = [
++    "EXPECTED_TOOL_NAMES",
++    "FORMATTER_ONLY",
+     "LINT_TOOLS",
++    "RECORDLESS_TOOLS",
++    "RECORD_PARSER_TOOLS",
++    "STATISTICS_PARSER_TOOLS",
+     "STRATEGIES",
+     "TOOLS",
+     "TOOLS_BY_NAME",
+@@ -26,6 +32,7 @@ __all__ = [
+     "LintTool",
+     "_DetectSecretsLintTool",
+     "_PylintLintTool",
++    "_RuffFormatLintTool",
+     "_StubtestLintTool",
+     "_VerifyTypesLintTool",
+     "_strategy_for",
+@@ -130,6 +137,19 @@ TOOLS: list[ToolSpec] = [
+ 
+ TOOLS_BY_NAME: dict[str, ToolSpec] = {t.name: t for t in TOOLS}
+ 
++# ── Single-source registry invariants ───────────────────────────────
++# Public constants consumed by the runner and its tests.  Each set is
++# derived from TOOLS or the parser tables so no test hardcodes counts.
++EXPECTED_TOOL_NAMES: frozenset[str] = frozenset(t.name for t in TOOLS)
++FORMATTER_ONLY: frozenset[str] = frozenset({"ruff format"})
++STATISTICS_PARSER_TOOLS: frozenset[str] = frozenset(_STATISTICS_PARSERS)
++RECORD_PARSER_TOOLS: frozenset[str] = frozenset(_RECORD_PARSERS)
++# The complement of RECORD_PARSER_TOOLS: tools whose output has no
++# per-violation record structure (tach/mypy.stubtest/pyright verify
++# types/detect-secrets emit counts or a pass-fail verdict, and
++# ruff format emits only a file-count summary).  Documented intentional.
++RECORDLESS_TOOLS: frozenset[str] = EXPECTED_TOOL_NAMES - RECORD_PARSER_TOOLS
++
+ 
+ class LintTool:
+     spec: ToolSpec
+@@ -153,6 +173,17 @@ class LintTool:
+     ) -> list[str]:
+         return _build_command(self.spec, config=config, fix=_fix, path=_path, exclude=_exclude)
+ 
++    @beartype
++    def build_format_command(
++        self,
++        *,
++        config: RunnerConfig,
++        _path: str | None = None,
++        _exclude: str | None = None,
++    ) -> list[str]:
++        """Mutating command used only by the ``--fix`` phase-1a format pass."""
++        return self.build_command(config=config, _fix=True, _path=_path, _exclude=_exclude)
++
+     @beartype
+     def statistics_flags(self) -> list[str]:
+         return _build_statistics_flags(self.spec)
+@@ -166,7 +197,7 @@ class LintTool:
+ 
+ 
+ # ── Per-tool strategy subclasses ─────────────────────────────────
+-# Six built-ins have fundamentally different command shapes that
++# Seven built-ins have fundamentally different command shapes that
+ # cannot be expressed via ToolSpec declarative fields alone.  Each
+ # overrides ``build_command`` with tool-specific logic, eliminating
+ # ``if spec.name ==`` branches from ``_build_command``.
+@@ -371,8 +402,46 @@ class _PylintTestsLintTool(LintTool):
+         return cmd
+ 
+ 
++class _RuffFormatLintTool(LintTool):
++    """``ruff format`` is check-only on normal passes; only phase 1a mutates."""
++
++    def _build(self, *, mode: str | None, config: RunnerConfig, path: str | None, exclude: str | None) -> list[str]:
++        cmd = [*self.spec.command]
++        if mode is not None:
++            cmd.append(mode)
++        config_path = (config.config_paths or {}).get(self.spec.name)
++        if config_path is None:
++            config_path = _default_config_paths(config.cwd).get(self.spec.name)
++        cmd.extend(_config_flag_for(self.spec.name, config_path))
++        cmd.extend(_build_path_and_exclude_args(self.spec, config=config, path=path, exclude=exclude))
++        return cmd
++
++    @beartype
++    def build_command(
++        self,
++        *,
++        config: RunnerConfig,
++        _fix: bool = False,
++        _path: str | None = None,
++        _exclude: str | None = None,
++    ) -> list[str]:
++        _ = _fix  # normal passes never mutate; mutation lives in build_format_command
++        return self._build(mode="--check", config=config, path=_path, exclude=_exclude)
++
++    @beartype
++    def build_format_command(
++        self,
++        *,
++        config: RunnerConfig,
++        _path: str | None = None,
++        _exclude: str | None = None,
++    ) -> list[str]:
++        return self._build(mode=None, config=config, path=_path, exclude=_exclude)
++
++
+ # Populate the strategy registry from the 14 built-ins.
+ _STRATEGY_CLASSES: dict[str, type[LintTool]] = {
++    "ruff format": _RuffFormatLintTool,
+     "mypy.stubtest": _StubtestLintTool,
+     "pyright verify types": _VerifyTypesLintTool,
+     "detect-secrets": _DetectSecretsLintTool,
+diff --git a/src/python_setup_lint/runner/dispatch.pyi b/src/python_setup_lint/runner/dispatch.pyi
+index 7c312ba..a9d0d02 100644
+--- a/src/python_setup_lint/runner/dispatch.pyi
++++ b/src/python_setup_lint/runner/dispatch.pyi
+@@ -1,8 +1,8 @@
+ """Stub for :mod:`python_setup_lint.runner.dispatch`.
+ 
+-Six built-ins override ``build_command`` for tool-specific command shapes
+-(``mypy.stubtest``, ``pyright verify types``, ``detect-secrets``, ``pylint``);
+-the rest inherit the default delegation to
++Seven built-ins override ``build_command`` for tool-specific command shapes
++(``ruff format``, ``mypy.stubtest``, ``pyright verify types``,
++``detect-secrets``, ``pylint``); the rest inherit the default delegation to
+ :mod:`python_setup_lint.runner.cmd_build`.
+ """
+ 
+@@ -16,6 +16,24 @@ TOOLS: list[ToolSpec]
+ TOOLS_BY_NAME: dict[str, ToolSpec]
+ """Tool specs keyed by name for fast lookup (built-ins only)."""
+ 
++EXPECTED_TOOL_NAMES: frozenset[str]
++"""Names of all 14 built-in tools, derived from :data:`TOOLS`."""
++
++FORMATTER_ONLY: frozenset[str]
++"""Built-ins that only format (``ruff format``); exempt from parser coverage."""
++
++STATISTICS_PARSER_TOOLS: frozenset[str]
++"""Built-ins with a statistics parser in
++:data:`python_setup_lint.runner.parsers._STATISTICS_PARSERS`."""
++
++RECORD_PARSER_TOOLS: frozenset[str]
++"""Built-ins with a per-violation record parser in
++:data:`python_setup_lint.runner.parsers._RECORD_PARSERS`."""
++
++RECORDLESS_TOOLS: frozenset[str]
++"""Built-ins without a record parser: ``tach check``, ``mypy.stubtest``,
++``pyright verify types``, ``detect-secrets``, and ``ruff format``."""
++
+ LINT_TOOLS: list[ToolSpec]
+ """Live registry of declared ``ToolSpec`` instances — built-ins plus any
+ extras registered via :func:`register_lint_tool`.  At import time it
+@@ -59,6 +77,13 @@ class LintTool:
+         _path: str | None = None,
+         _exclude: str | None = None,
+     ) -> list[str]: ...
++    def build_format_command(
++        self,
++        *,
++        config: RunnerConfig,
++        _path: str | None = None,
++        _exclude: str | None = None,
++    ) -> list[str]: ...
+     def statistics_flags(self) -> list[str]: ...
+     def parse_statistics(self, stdout: str, stderr: str) -> list[tuple[str, int]]: ...
+ 
+diff --git a/src/python_setup_lint/runner/types.pyi b/src/python_setup_lint/runner/types.pyi
+index 5eaf4a5..b39c89d 100644
+--- a/src/python_setup_lint/runner/types.pyi
++++ b/src/python_setup_lint/runner/types.pyi
+@@ -80,7 +80,7 @@ class RunnerConfig:
+         default_py_dirs: Default directories for pylint ``_find_py_files``
+             discovery when no ``--path`` is given.
+         tools_override: Optional list of tool names to run.  ``None``
+-            runs all 13 default tools.  Unknown names raise
++            runs all 14 default tools.  Unknown names raise
+             :class:`python_setup_lint.runner.extra_tools.ExtraToolsConfigError`
+             (T8 fail-fast) rather than silently running a subset.
+         tool_timeouts: Per-tool timeout overrides (seconds). Tool name → int.
+diff --git a/tests/runner/_factories.py b/tests/runner/_factories.py
+index c398233..c4277b8 100644
+--- a/tests/runner/_factories.py
++++ b/tests/runner/_factories.py
+@@ -31,23 +31,36 @@ if TYPE_CHECKING:
+ InstallFakeFn = Callable[..., Any]
+ 
+ 
+-# The 13 built-in tool names — used both for the canned-results factory
++# The 14 built-in tool names — used both for the canned-results factory
+ # (dict-mode ``FakeRunCmd``) and for the "every tool dispatched" assertion
+ # in the orchestration tests.
+ ALL_TOOL_NAMES: frozenset[str] = frozenset(t.name for t in TOOLS)
+ 
+ 
++def runner_registry_constant(name: str) -> frozenset[str]:
++    """Return public tool-registry constant *name*, asserting the runner re-exports it.
++
++    Kept as a runtime lookup so a missing export fails the owning test with a
++    clear assertion instead of aborting collection for the whole module.
++    """
++    import python_setup_lint.runner as runner_pkg
++
++    value = getattr(runner_pkg, name, None)
++    assert value is not None, f"python_setup_lint.runner must re-export {name}"
++    return frozenset(value)
++
++
+ def canned_results_all_tools(
+     *,
+     exit_code: int = 0,
+     stdout: str = "",
+     overrides: Mapping[str, LintResult] | None = None,
+ ) -> dict[str, LintResult]:  # pylint: disable=generic-key-dict  # dict[str, LintResult] is a test helper; string keys are tool labels
+-    """Build the 13-tool canned-result dict for ``fake_run_cmd_factory``.
++    """Build the 14-tool canned-result dict for ``fake_run_cmd_factory``.
+ 
+     Every built-in label maps to a ``LintResult`` with defaults; pass
+     *overrides* to vary any subset. Used by the orchestration / smoke
+-    tests so they stop repeating the 13-key dict literal.
++    tests so they stop repeating the 14-key dict literal.
+     """
+     # Late import to avoid any conftest-collection ordering surprise.
+     from python_setup_lint.testing import make_lint_result
+diff --git a/tests/runner/_factories_extras.py b/tests/runner/_factories_extras.py
+index b9e44de..7adc178 100644
+--- a/tests/runner/_factories_extras.py
++++ b/tests/runner/_factories_extras.py
+@@ -1,4 +1,4 @@
+-# pylint: disable=too-many-lines  # 502 lines — factory data for 13 tools; splitting would lose context
++# pylint: disable=too-many-lines  # 502 lines — factory data for 14 tools; splitting would lose context
+ """Extra-tools, dispatch, and small parametrize tables for python-setup runner tests.
+ 
+ Moved from ``_factories.py`` to keep each file under 500 lines (pylint C0302).
+@@ -371,16 +371,25 @@ CALLS_CAPTURED_CASES: list[ParameterSet] = [
+ ]
+ 
+ # Smoke-integration invariant table.
++
++
++def _expected_dispatched_tool_count(*, skipped: frozenset[str] = frozenset()) -> int:
++    """Count built-in tools minus *skipped*, read from the public registry."""
++    from ._factories import runner_registry_constant
++
++    return len(runner_registry_constant("EXPECTED_TOOL_NAMES") - skipped)
++
++
+ RUN_LINT_FAKE_INVARIANT_CASES: list[ParameterSet] = [
+     pytest.param(
+         {"path": "src/python_setup_lint/runner.py"},
+-        lambda f: len(f.calls) == 13 and all(len(c.cmd) > 0 and c.label for c in f.calls),
+-        id="all_13_tools_dispatched",
++        lambda f: len(f.calls) == _expected_dispatched_tool_count() and all(len(c.cmd) > 0 and c.label for c in f.calls),
++        id="all_14_tools_dispatched",
+     ),
+     pytest.param(
+         {"path": "src/python_setup_lint/runner.py", "fix": True},
+         lambda f: all(
+-            any("--fix" in c.cmd for c in f.calls if c.label == name) for name in {"ruff check", "rumdl check", "ty check"}
++            any("--fix" in c.cmd for c in f.calls if c.label == name) for name in ("ruff check", "rumdl check", "ty check")
+         ),
+         id="fix_flag_propagates_to_supports_fix_labels",
+     ),
+@@ -396,7 +405,7 @@ RUN_LINT_FAKE_INVARIANT_CASES: list[ParameterSet] = [
+     pytest.param(
+         {"package_name": None, "path": "src/python_setup_lint/runner.py"},
+         lambda f: (
+-            len(f.calls) == 11
++            len(f.calls) == _expected_dispatched_tool_count(skipped=frozenset({"mypy.stubtest", "pyright verify types"}))
+             and "mypy.stubtest" not in {c.label for c in f.calls}
+             and "pyright verify types" not in {c.label for c in f.calls}
+         ),
+diff --git a/tests/runner/test_bench_runner_overhead.py b/tests/runner/test_bench_runner_overhead.py
+index 20fe6d3..7054376 100644
+--- a/tests/runner/test_bench_runner_overhead.py
++++ b/tests/runner/test_bench_runner_overhead.py
+@@ -2,7 +2,7 @@
+ """Benchmark: per-tool time/memory + runner overhead measurement.
+ 
+ ``@pytest.mark.slow`` — excluded from ``-m "not slow"`` runs.  Spawns real
+-subprocesses for all 13 lint tools (pylint ×3 configurations) on a minimal
++subprocesses for all 14 lint tools (pylint ×3 configurations) on a minimal
+ synthetic project.  Writes ``tmp_path/bench-runner-overhead.md`` with the
+ per-tool time/memory table and the runner-overhead before/after numbers.
+ 
+@@ -221,7 +221,7 @@ def test_bench_runner_overhead_given_tmp_path_then_within_threshold(tmp_path: Pa
+             "`extra_tools.py:348-360`) so that repeated `run_lint` invocations "
+             "in the same process reuse the cached parse. Overhead was already "
+             "negligible before any memoisation (T11 PoW baseline 0.001s) and "
+-            "remains negligible because per-process tool-dispatch is N=13 tool "
++            "remains negligible because per-process tool-dispatch is N=14 tool "
+             "spec entries already in memory.",
+             "",
+             "## Verification Gate",
+diff --git a/tests/runner/test_extra_tools.py b/tests/runner/test_extra_tools.py
+index db01450..a464512 100644
+--- a/tests/runner/test_extra_tools.py
++++ b/tests/runner/test_extra_tools.py
+@@ -234,7 +234,7 @@ class TestExtraToolsMerge:
+         _register_extra_tools([_X1, _X2])
+         names = {t.name for t in LINT_TOOLS}
+         assert {"x1", "x2"} <= names
+-        assert set(TOOLS_BY_NAME) <= names  # all 13 built-ins remain post-merge
++        assert set(TOOLS_BY_NAME) <= names  # all 14 built-ins remain post-merge
+ 
+     def test_extra_tools_merge_given_builtin_name_collision_then_rejects(self) -> None:
+         collision = _ExtraToolRegistration(
+diff --git a/tests/runner/test_lint_runner.py b/tests/runner/test_lint_runner.py
+index bddedc2..be8620d 100644
+--- a/tests/runner/test_lint_runner.py
++++ b/tests/runner/test_lint_runner.py
+@@ -47,11 +47,12 @@ _CONFIG = RunnerConfig(cwd=Path.cwd())
+ 
+ 
+ class TestToolSpec:
+-    """The static 13-tool table invariant."""
++    """The static 14-tool table invariant."""
+ 
+     def test_tool_spec_given_known_tools_then_present(self) -> None:
+         assert {t.name for t in TOOLS} == {
+             "tach check",
++            "ruff format",
+             "ruff check",
+             "rumdl check",
+             "mypy",
+@@ -73,7 +74,7 @@ class TestToolSpec:
+             "ty check",
+         }
+         assert all(t.name for t in TOOLS)
+-        assert len({t.name for t in TOOLS}) == len(TOOLS) == 13
++        assert len({t.name for t in TOOLS}) == len(TOOLS) == 14
+ 
+     def test_tool_spec_given_yamllint_then_default_paths_is_dot(self) -> None:
+         """yamllint default_paths changed from config/*.yaml to . (T5 fix)."""
+diff --git a/tests/runner/test_lint_runner_stats.py b/tests/runner/test_lint_runner_stats.py
+index 58b7481..ff92bb2 100644
+--- a/tests/runner/test_lint_runner_stats.py
++++ b/tests/runner/test_lint_runner_stats.py
+@@ -28,7 +28,7 @@ from python_setup_lint.runner._config import _SUPPORTED_CONFIG_KEYS
+ from python_setup_lint.runner.cmd_build import _build_command, _build_statistics_flags
+ from python_setup_lint.runner.output import _print_statistics_grouped, _sort_counts
+ from python_setup_lint.runner.parsers import _STATISTICS_PARSERS
+-from tests.runner._factories import install_fake_runner, lint_config, write_pyproject
++from tests.runner._factories import install_fake_runner, lint_config, runner_registry_constant, write_pyproject
+ from tests.runner._factories_extras import (
+     CLEAN_EXTRAS_PYPROJECT_BODY,
+     GROUPED_OUTPUT_CASES,
+@@ -70,7 +70,10 @@ def test_statistics_parser(tool_name: str, stdout: str, stderr: str, expected: l
+ 
+ 
+ def test_statistics_parsers_given_all_tools_then_covered() -> None:
+-    assert {t.name for t in TOOLS} <= set(_STATISTICS_PARSERS)
++    formatter_only = runner_registry_constant("FORMATTER_ONLY")
++    statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
++    assert statistics_tools == frozenset(_STATISTICS_PARSERS)
++    assert {t.name for t in TOOLS} - formatter_only == statistics_tools
+ 
+ 
+ def test_parse_strategies_given_stats_then_includes_all_keys() -> None:
+@@ -218,7 +221,7 @@ class TestT8FailFastConfig:
+ 
+ 
+ class TestLintToolRegistry:
+-    """STRATEGIES/LINT_TOOLS mirror the 13 built-ins AND strategies are LintTool instances."""
++    """STRATEGIES/LINT_TOOLS mirror the 14 built-ins AND strategies are LintTool instances."""
+ 
+     @pytest.mark.parametrize(
+         "registry",
+diff --git a/tests/runner/test_real_pipeline_smoke.py b/tests/runner/test_real_pipeline_smoke.py
+index 7ad46d9..671821a 100644
+--- a/tests/runner/test_real_pipeline_smoke.py
++++ b/tests/runner/test_real_pipeline_smoke.py
+@@ -21,7 +21,7 @@ def test_consolidated_real_pipeline_smoke(
+ 
+     Asserts:
+     - ``isinstance(rc, int)`` — the pipeline ran to completion.
+-    - All 13 tools appear in the printed output (captured via capsys).
++    - All 14 tools appear in the printed output (captured via capsys).
+     """
+     src = tmp_path / "src"
+     src.mkdir()
+diff --git a/tests/runner/test_runner_format_contract.py b/tests/runner/test_runner_format_contract.py
+new file mode 100644
+index 0000000..767cc7b
+--- /dev/null
++++ b/tests/runner/test_runner_format_contract.py
+@@ -0,0 +1,174 @@
++"""ADR-005 contract tests: ``ruff format`` modes + single-source 14-tool registry.
++
++The runner keeps 14 built-in tools — 13 analysis/format-check tools plus the
++``ruff format`` formatter.  Normal (non-fix) passes must run the formatter in
++check mode; only the fix-only phase may mutate files.  Registry constants are
++owned by :mod:`python_setup_lint.runner.dispatch` and re-exported from
++:mod:`python_setup_lint.runner` so tests, docs and dispatch share one source.
++"""
++
++from __future__ import annotations
++
++import json
++from collections.abc import Callable
++from pathlib import Path
++from typing import cast
++
++import pytest
++
++import python_setup_lint.runner.output as _output_module
++from python_setup_lint.runner import STRATEGIES, TOOLS, RunnerConfig, run_lint
++from python_setup_lint.runner._config import _default_config_paths
++from python_setup_lint.runner.cmd_build import _config_flag_for
++from python_setup_lint.testing import FakeRunCmd, fake_run_cmd_factory
++from tests.runner._factories import canned_results_all_tools, runner_registry_constant
++
++pytestmark = pytest.mark.no_external_api
++
++_CONFIG = RunnerConfig(cwd=Path.cwd())
++_GOLDEN_COUNTS = Path(__file__).resolve().parent.parent / "data" / "golden" / "minimal_sample_project_tool_counts.json"
++
++_EXPECTED_TOOL_NAMES = frozenset(
++    {
++        "tach check",
++        "ruff format",
++        "ruff check",
++        "rumdl check",
++        "mypy",
++        "yamllint",
++        "ty check",
++        "mypy.stubtest",
++        "pyright check",
++        "pyright verify types",
++        "pylint",
++        "pylint-pyi",
++        "pylint tests",
++        "detect-secrets",
++    }
++)
++_FORMATTER_ONLY = frozenset({"ruff format"})
++_RECORDLESS_TOOLS = frozenset({"tach check", "mypy.stubtest", "pyright verify types", "detect-secrets", "ruff format"})
++_REGISTRY_CONSTANT_NAMES = (
++    "EXPECTED_TOOL_NAMES",
++    "FORMATTER_ONLY",
++    "STATISTICS_PARSER_TOOLS",
++    "RECORD_PARSER_TOOLS",
++    "RECORDLESS_TOOLS",
++)
++
++
++class TestRuffFormatStrategy:
++    """``ruff format`` is check-only on normal passes and mutates only in fix phase 1a."""
++
++    def test_ruff_format_build_command_given_normal_pass_then_check_mode(self) -> None:
++        cmd = STRATEGIES["ruff format"].build_command(config=_CONFIG)
++        assert cmd[:3] == ["ruff", "format", "--check"], f"normal pass must run check mode, got {cmd!r}"
++        assert "--config" in cmd, f"normal pass must pin the shipped ruff config, got {cmd!r}"
++        config_index = cmd.index("--config")
++        config_path = Path(cmd[config_index + 1])
++        assert config_path.is_file(), f"resolved ruff config must exist: {config_path}"
++        assert config_path.name == "ruff.toml"
++
++    def test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode(self) -> None:
++        build_format_command = getattr(STRATEGIES["ruff format"], "build_format_command", None)
++        assert callable(build_format_command), "ruff format strategy must expose build_format_command"
++        cmd: list[str] = cast("Callable[..., list[str]]", build_format_command)(config=_CONFIG)
++        assert cmd[:2] == ["ruff", "format"]
++        assert "--check" not in cmd, f"fix phase must mutate, got {cmd!r}"
++        assert "--config" in cmd, f"fix phase must pin the shipped ruff config, got {cmd!r}"
++        config_index = cmd.index("--config")
++        assert Path(cmd[config_index + 1]).is_file()
++
++
++class TestRuffFormatConfig:
++    """``ruff format`` participates in shipped-config discovery and flag mapping."""
++
++    def test_default_config_paths_given_ruff_format_then_ruff_toml(self) -> None:
++        paths = _default_config_paths(Path.cwd())
++        assert "ruff format" in paths, f"shipped config discovery missing ruff format: {sorted(paths)}"
++        assert paths["ruff format"].name == "ruff.toml"
++
++    def test_config_flag_for_ruff_format_then_config_flag(self, tmp_path: Path) -> None:
++        ruff_toml = tmp_path / "ruff.toml"
++        ruff_toml.write_text("", encoding="utf-8")
++        assert _config_flag_for("ruff format", ruff_toml) == ["--config", str(ruff_toml)]
++
++
++class TestRegistryConstants:
++    """Built-in registry constants are exported from the runner package."""
++
++    def test_expected_tool_names_given_exported_then_matches_builtins(self) -> None:
++        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
++        assert names == _EXPECTED_TOOL_NAMES
++        assert names == {t.name for t in TOOLS}
++        assert len(names) == 14
++
++    def test_formatter_only_and_statistics_parser_tools_partition_all_tools(self) -> None:
++        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
++        formatter_only = runner_registry_constant("FORMATTER_ONLY")
++        statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
++        assert formatter_only == _FORMATTER_ONLY
++        assert len(statistics_tools) == 13
++        assert statistics_tools == names - formatter_only
++
++    def test_record_parser_and_recordless_tools_partition_all_tools(self) -> None:
++        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
++        record_tools = runner_registry_constant("RECORD_PARSER_TOOLS")
++        recordless = runner_registry_constant("RECORDLESS_TOOLS")
++        assert len(record_tools) == 9
++        assert recordless == _RECORDLESS_TOOLS
++        assert record_tools == names - recordless
++
++    def test_registry_constants_then_match_parser_tables(self) -> None:
++        from python_setup_lint.runner.parsers import _RECORD_PARSERS, _STATISTICS_PARSERS
++
++        assert runner_registry_constant("STATISTICS_PARSER_TOOLS") == frozenset(_STATISTICS_PARSERS)
++        assert runner_registry_constant("RECORD_PARSER_TOOLS") == frozenset(_RECORD_PARSERS)
++
++    def test_registry_constants_given_runner_then_alias_dispatch_objects(self) -> None:
++        import python_setup_lint.runner as runner_pkg
++        from python_setup_lint.runner import dispatch
++
++        for name in _REGISTRY_CONSTANT_NAMES:
++            value = getattr(runner_pkg, name, None)
++            assert value is not None, f"python_setup_lint.runner must re-export {name}"
++            assert getattr(dispatch, name, None) is value, f"{name} must be owned by dispatch and re-exported unchanged"
++
++
++def _run_with_fake(monkeypatch: pytest.MonkeyPatch, *, fix: bool = False) -> FakeRunCmd:
++    """Run ``run_lint`` with a dict-mode fake and return the call recorder."""
++    fake = fake_run_cmd_factory(canned_results_all_tools())
++    monkeypatch.setattr(_output_module, "_run_cmd", fake)
++    config = RunnerConfig(cwd=Path.cwd(), package_name="python_setup_lint")
++    rc = run_lint(config=config, path="src/python_setup_lint/runner.py", fix=fix)
++    assert isinstance(rc, int)
++    return fake
++
++
++class TestPipelineModes:
++    """Only ``--fix`` may mutate files; normal passes are check-only."""
++
++    def test_run_lint_without_fix_runs_ruff_format_check_only(self, monkeypatch: pytest.MonkeyPatch) -> None:
++        fake = _run_with_fake(monkeypatch)
++        format_calls = [call.cmd for call in fake.calls if call.label == "ruff format"]
++        assert len(format_calls) == 1, f"normal pass must run ruff format exactly once, got {format_calls!r}"
++        assert "--check" in format_calls[0], f"normal pass must not mutate, got {format_calls[0]!r}"
++        assert "--config" in format_calls[0], f"normal pass must use the shipped config, got {format_calls[0]!r}"
++
++    def test_run_lint_with_fix_formats_first_then_checks(self, monkeypatch: pytest.MonkeyPatch) -> None:
++        fake = _run_with_fake(monkeypatch, fix=True)
++        format_calls = [call.cmd for call in fake.calls if call.label == "ruff format"]
++        assert len(format_calls) == 2, f"fix phase + lint pass must each run ruff format, got {format_calls!r}"
++        mutate_cmd, check_cmd = format_calls
++        assert "--check" not in mutate_cmd, f"phase 1a must mutate, got {mutate_cmd!r}"
++        assert "--check" in check_cmd, f"lint pass must check, got {check_cmd!r}"
++        assert "--config" in mutate_cmd and "--config" in check_cmd
++
++
++class TestGoldenToolCounts:
++    """Committed golden counts stay in lockstep with the 14-tool registry."""
++
++    def test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero(self) -> None:
++        counts: dict[str, int] = json.loads(_GOLDEN_COUNTS.read_text(encoding="utf-8"))
++        assert set(counts) == {t.name for t in TOOLS}
++        assert counts["ruff format"] == 0
+diff --git a/tests/runner/test_self_lint_clean.py b/tests/runner/test_self_lint_clean.py
+index b1506e5..c2d0797 100644
+--- a/tests/runner/test_self_lint_clean.py
++++ b/tests/runner/test_self_lint_clean.py
+@@ -1,6 +1,6 @@
+ """Guard against python-setup's own self-lint regression.
+ 
+-Runs the full lint pipeline (all 13 tools) against the python-setup repo root
++Runs the full lint pipeline (all 14 tools) against the python-setup repo root
+ with the shipped config.  A self-lint regression (new violation, crash, or
+ unexpected skip) fails this test rather than slipping into CI.
+ """
+diff --git a/tests/runner/test_t3_coverage.py b/tests/runner/test_t3_coverage.py
+index e5cf65b..043fb49 100644
+--- a/tests/runner/test_t3_coverage.py
++++ b/tests/runner/test_t3_coverage.py
+@@ -21,56 +21,37 @@ from python_setup_lint.runner.parsers import (
+     _parse_yamllint_parsable,
+ )
+ from python_setup_lint.testing import fake_run_cmd_factory, make_lint_result
++from tests.runner._factories import runner_registry_constant
+ 
+ if TYPE_CHECKING:
+     import pytest
+ 
+-# ── All TOOLS must have a registered parser ────────────────────────
++# ── All non-formatter tools must have a registered parser ──────────
+ 
+ 
+ class TestParserCompleteness:
+-    """Every tool in TOOLS must have a corresponding statistics parser."""
+-
+-    # Replicate the parser dispatch dict here to catch drift
+-    # (importing a private symbol is OK in the same package tests)
+-    EXPECTED_PARSER_TOOLS = {
+-        "ruff check",
+-        "rumdl check",
+-        "pylint",
+-        "pylint-pyi",
+-        "pylint tests",
+-        "pyright check",
+-        "pyright verify types",
+-        "mypy",
+-        "ty check",
+-        "tach check",
+-        "yamllint",
+-        "mypy.stubtest",
+-        "detect-secrets",
+-    }
++    """Every non-formatter tool in TOOLS must have a corresponding statistics parser."""
+ 
+     def test_parser_completeness_given_all_tools_then_have_parser(self) -> None:
+         """Every TOOLS entry has a statistics parser registered."""
+         tool_names = {t.name for t in TOOLS}
+-        missing = tool_names - self.EXPECTED_PARSER_TOOLS
++        missing = tool_names - runner_registry_constant("FORMATTER_ONLY") - runner_registry_constant("STATISTICS_PARSER_TOOLS")
+         assert not missing, f"TOOLS missing statistics parsers: {missing}"
+ 
+     def test_parser_completeness_given_all_parsers_then_correspond_to_tools(self) -> None:
+         """Every registered parser tool name exists in TOOLS."""
+         tool_names = {t.name for t in TOOLS}
+-        extra = self.EXPECTED_PARSER_TOOLS - tool_names
++        extra = runner_registry_constant("STATISTICS_PARSER_TOOLS") - tool_names
+         assert not extra, f"Parsers exist for unknown tools: {extra}"
+ 
+     def test_parser_completeness_given_statistics_flags_then_align_with_parsers(self) -> None:
+         """Tools with a statistics parser also have non-empty flags."""
+-        has_flags = set()
+-        for spec in TOOLS:
+-            if _build_statistics_flags(spec):
+-                has_flags.add(spec.name)
++        has_flags = {spec.name for spec in TOOLS if _build_statistics_flags(spec)}
+         # pyright verify types, mypy.stubtest, detect-secrets have no extra flags
+         # but still have parsers
+-        assert has_flags <= self.EXPECTED_PARSER_TOOLS
+-        no_flag_but_parser = self.EXPECTED_PARSER_TOOLS - has_flags
++        statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
++        assert has_flags <= statistics_tools
++        no_flag_but_parser = statistics_tools - has_flags
+         assert no_flag_but_parser <= {
+             "pyright verify types",
+             "mypy.stubtest",
+diff --git a/tests/runner/test_testing_fakes.py b/tests/runner/test_testing_fakes.py
+index 8c56a6f..54a41ba 100644
+--- a/tests/runner/test_testing_fakes.py
++++ b/tests/runner/test_testing_fakes.py
+@@ -130,11 +130,11 @@ def test_fake_run_cmd_direct_construction(results: Any, label: str, expected_exi
+ # Parametrised (kwargs, predicate) invariant table. Each row asserts a
+ # distinct behavioural invariant of ``run_lint`` with the fake installed
+ # (tool count, --fix propagation, --exclude propagation, package_name=None
+-# skip). Uses ``canned_results_all_tools()`` to avoid the 13-key dict literal.
++# skip). Uses ``canned_results_all_tools()`` to avoid the 14-key dict literal.
+ 
+ 
+ def _install_fake_and_run(monkeypatch: pytest.MonkeyPatch, **run_lint_kwargs: Any) -> FakeRunCmd:
+-    """Install a 13-tool dict-mode ``FakeRunCmd`` + invoke ``run_lint``.
++    """Install a 14-tool dict-mode ``FakeRunCmd`` + invoke ``run_lint``.
+ 
+     ``package_name=None`` ⇒ skip stubtest+verifytypes. Returns ``fake`` for assertion.
+     Resets ``LINT_TOOLS`` to built-in ``TOOLS`` to avoid cross-test pollution.
+@@ -162,7 +162,7 @@ def test_run_lint_with_fake_dispatch_invariants(
+     predicate: Callable[[FakeRunCmd], bool],
+     isolated_runner_registries: None,
+ ) -> None:
+-    """One ``run_lint(...)`` + 13-tool fake; the row's predicate asserts the invariant."""
++    """One ``run_lint(...)`` + 14-tool fake; the row's predicate asserts the invariant."""
+     fake = _install_fake_and_run(monkeypatch, **run_lint_kwargs)
+     assert predicate(fake), f"Invariant failed; calls={[c.label for c in fake.calls]}"
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
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..aa051b1
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T11:48:24.732Z
+session: 01a1bafd-1a88-708a-80e0-b376fcbd0712
+endedAt: 2026-11-08T12:04:12.518Z
+usage:
+  inputTokens: 69775
+  outputTokens: 27725
+  costUsd: 0.014645
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T11-48-32-008Z_01a1bafd-1a88-708a-80e0-b376fcbd0712.jsonl
diff --git a/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..0d357f3
--- /dev/null
+++ b/.factory/tasks/modernize/items/runner-format-contract/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,82 @@
+status: changes_requested
+summary: "Contract behavior green (24/24, check-vs-mutate, registry,
+  no-mutation) but story introduces 4 lint regressions: I001x2, R0801, W9700x2,
+  C0302; lint gate red."
+suggestions:
+  - id: ruff-i001-import-sort
+    disposition: fix
+    summary: Fix new ruff I001 in runner __init__.py/.pyi import sort
+    detail: "Independent repro with shipped config fails: `uv run ruff check
+      --config config/ruff.toml src/python_setup_lint/runner/__init__.py
+      src/python_setup_lint/runner/__init__.pyi` -> I001x2. Fix is swap
+      RECORD_PARSER_TOOLS before RECORDLESS_TOOLS (ruff --diff confirms). Engine
+      lint gate also reports these 2 plus pre-existing SIM102. Pre-existing
+      SIM102/coverage.py out of scope; I001 is story-introduced and violates
+      VERIFY zero-violations."
+    location:
+      file: src/python_setup_lint/runner/__init__.py
+      line: 20
+  - id: pylint-r0801-duplicate-tool-list
+    disposition: fix
+    summary: Dedupe 14-name literal duplicated between test files (R0801)
+    detail: "Independent repro: `uv run lint --tools 'pylint tests'` FAILED with
+      R0801 Similar lines in 2 files test_lint_runner:[53:70] vs
+      test_runner_format_contract:[32:47] (14 tool-name lines). Story-new file
+      duplicates the literal. Fix by sharing one literal/helper or narrow
+      justified disable; do not weaken assertions."
+    location:
+      file: tests/runner/test_runner_format_contract.py
+      line: 32
+  - id: pylint-w9700-docstring-in-impl
+    disposition: fix
+    summary: Move usage docstrings from dispatch.py impl to .pyi (W9700x2)
+    detail: "Independent repro: `uv run lint --tools 'pylint'` flags W9700 at
+      dispatch.py:177 LintTool.build_format_command and :405 _RuffFormatLintTool
+      (usage docstrings belong in .pyi per CodingRules). Both are story-new. Fix
+      by moving docs to dispatch.pyi / removing impl docstrings."
+    location:
+      file: src/python_setup_lint/runner/dispatch.py
+      line: 177
+  - id: pylint-c0302-dispatch-too-long
+    disposition: fix
+    summary: Resolve new C0302 dispatch.py 542/500 (story pushed over limit)
+    detail: Parent dispatch was 473 lines; story adds ~69 to 542, now flagged by
+      pylint C0302 via `uv run lint --tools 'pylint'`. VERIFY requires zero
+      violations. Fix via split or justified disable with precedent (cf.
+      _factories_extras too-many-lines disable). Pre-existing cli.py R0914
+      remains out of scope.
+    location:
+      file: src/python_setup_lint/runner/dispatch.py
+      line: 1
+  - id: lint-gate-evidence-omits-ruff-format
+    disposition: optional
+    summary: Engine lint gate command omitted ruff format; overall pass misleading
+    detail: checks.yaml lint sub-gate status=fail but overall gates=status pass;
+      lint command lists 13 tools and omits 'ruff format'. Independently `uv run
+      lint --tools 'ruff format'` PASSED and git status clean, so behavior OK,
+      but gate evidence does not prove full 14-tool lint-clean. No code change;
+      record for engine/operator.
+    location:
+      file: src/python_setup_lint/runner/cli.py
+      line: 73
+  - id: parsers-pyi-13-is-parser-count
+    disposition: optional
+    summary: parsers.pyi 13s are statistics-parser counts, correctly allowlisted
+    detail: Grep finds 13-built-in-names in parsers.pyi:20,37. These refer to
+      _BUILTIN_PARSE_STRATEGY_TO_PARSER / STATISTICS_PARSER_TOOLS (legitimately
+      13 with FORMATTER_ONLY exempt), not tool count. No change per assignment
+      allowlist for non-tool-count 13s.
+    location:
+      file: src/python_setup_lint/runner/parsers.pyi
+      line: 20
+  - id: agents-test-counts-stale
+    disposition: optional
+    summary: AGENTS.md test counts stale (1290/7 vs 1352/9), defer to docs-counts-sync
+    detail: Tool-count migration to 14 verified (AGENTS 9,43,63,92,93; README;
+      overlays; tutorials; troubleshooting; cli help; CHANGELOG:104 correctly
+      stays historical 13). Lines 10-11 test counts (1290 pass, 7 integration)
+      mismatch runtime (1352 passed, 9 integration) but owned by
+      docs-counts-sync follow-up, not this story.
+    location:
+      file: AGENTS.md
+      line: 10
diff --git a/.factory/tasks/modernize/journal.ndjson b/.factory/tasks/modernize/journal.ndjson
index af4679f..1140334 100644
--- a/.factory/tasks/modernize/journal.ndjson
+++ b/.factory/tasks/modernize/journal.ndjson
@@ -780,10 +780,3 @@
 {"type":"step_timeout_armed","task":"modernize","step":"pm-edits-2","timeoutSec":900,"ts":"2026-11-08T10:48:49.821Z"}
 {"type":"step_finished","task":"modernize","step":"pm-edits-2","attempt":2,"status":"ok","sessionId":"01a1bac4-cb04-7739-a895-0f6b72ed4e68","usage":{"inputTokens":5421,"outputTokens":6336,"costUsd":0.001903},"ts":"2026-11-08T10:49:19.949Z"}
 {"type":"pm_edits_repaired","errors":[],"ts":"2026-11-08T10:49:19.949Z"}
-{"type":"lock_takeover","task":"modernize","previousPid":3533107,"previousHost":"Slava-Yoga","newPid":69767,"newHost":"Slava-Yoga","ts":"2026-11-08T11:46:55.654Z"}
-{"type":"task_started","task":"modernize","branch":"topic/modernize","ts":"2026-11-08T11:46:55.655Z"}
-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:46:58.497Z"}
-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:47:03.113Z"}
-{"type":"steer_processed","file":"1794100866341.md","classification":{"refs":["plan-1","awareness-plan-1-material-definition-needs-awareness","awareness-plan-1-cache-file-needs-awareness","awareness-plan-1-never-linting-policy-needs-awareness"],"kind":"answer","urgency":"next-architect-call","summary":"Operator accepts all three plan-1 awareness items (material definition, git-stored cache at linted root, never-test-linting broadening) as intentional; no further action, no regressions assumed."},"ts":"2026-11-08T11:48:08.343Z"}
-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:48:10.744Z"}
-{"type":"harness_model_fallback","task":"modernize","step":"steer-classify","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24443 | ` + \"Then use /model to select a model.\");\n24444 |       }\n24445 |       const v = await Ce(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24446 |       if (!v && !await this.#y.applyMissingCredentialFallback(p.signal)) {\n24447 |         if (p.signal.aborted)\n24448 |         throw new yc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Kn (/$bunfs/root/chunks/cli-9adabh14.js:24448:15)\n      at async #Ao (/$bunfs/root/chunks/cli-9adabh14.js:24139:25)\n      at async #ca (/$bunfs/root/chunks/cli-9adabh14.js:24001:30)\n      at async #Is (/$bunfs/root/chunks/cli-9adabh14.js:20851:28)","ts":"2026-11-08T11:48:13.181Z"}
diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md b/.factory/tasks/modernize/steer/fromuserpending/1794100866341.md
similarity index 100%
rename from .factory/tasks/modernize/steer/fromusertaken/1794100866341.md
rename to .factory/tasks/modernize/steer/fromuserpending/1794100866341.md
diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md b/.factory/tasks/modernize/steer/fromuserpending/1794128584028.md
similarity index 100%
rename from .factory/tasks/modernize/steer/fromusertaken/1794128584028.md
rename to .factory/tasks/modernize/steer/fromuserpending/1794128584028.md
diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml b/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml
deleted file mode 100644
index e1bf450..0000000
--- a/.factory/tasks/modernize/steer/fromusertaken/1794100866341.md.classification.yaml
+++ /dev/null
@@ -1,10 +0,0 @@
-refs:
-  - plan-1
-  - awareness-plan-1-material-definition-needs-awareness
-  - awareness-plan-1-cache-file-needs-awareness
-  - awareness-plan-1-never-linting-policy-needs-awareness
-kind: answer
-urgency: next-architect-call
-summary: Operator accepts all three plan-1 awareness items (material definition,
-  git-stored cache at linted root, never-test-linting broadening) as
-  intentional; no further action, no regressions assumed.
diff --git a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml b/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml
deleted file mode 100644
index e1648a4..0000000
--- a/.factory/tasks/modernize/steer/fromusertaken/1794128584028.md.classification.yaml
+++ /dev/null
@@ -1,8 +0,0 @@
-refs:
-  - awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup
-  - consolidate-integration-helpers-v2
-kind: answer
-urgency: next-architect-call
-summary: Approves follow-up docs/prod story (small dev kind, depends on v3 line)
-  to sync AGENTS.md counts and cli.py:314 help text, foldable into pending
-  docs-counts-sync story; pre-existing baseline reds stay out of story budgets.
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
index f11cbf0..2879adf 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup.yaml
@@ -10,15 +10,5 @@ question: Assignment named this story sole AGENTS.md counts owner, but
   lint` stays red on pre-existing base failures (SIM102, R0914, C0208,
   orchestration-journal detect-secrets) outside this story's budget; all files
   touched here are ruff/format clean.
-status: answered
+status: open
 createdAt: 2026-11-08T07:10:59.798Z
-answer: >
-  Operator acknowledges
-  awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup:
-  restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct
-  (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md
-  counts and the cli help text is approved — add it (small dev kind, depends on
-  the v3 line) when the wave-report next amends, or fold the two-line sync into
-  the docs-counts-sync story if it is still pending. Pre-existing red lint/test
-  baseline items stay out of story budgets. No other action.
-answeredAt: 2026-11-08T11:48:21.642Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
index 5e38feb..dc60cf3 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-cache-file-needs-awareness.yaml
@@ -5,15 +5,5 @@ question: Committed file in every linted repo (incl. consumers) with reviewable
   diffs and possible branch conflicts. Weights 0.03-0.8GB in model cache with
   own licenses. Install docs must mention file. Architect decides now; operator
   should be aware of footprint and license review.
-status: answered
+status: open
 createdAt: 2026-11-08T00:51:56.276Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.286Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
index 68b67ff..4a3fcb6 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-cache-location.yaml
@@ -6,15 +6,5 @@ question: Assumption + ADR-003 place git-stored cache at linted root for
   file per consumer, reviewable diffs, possible line-local merges, must pass
   detect-secrets. Architect can proceed; operator should be aware before epic
   implements.
-status: answered
+status: open
 createdAt: 2026-11-08T01:06:40.589Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.293Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
index 77784e2..d6d2afe 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-material-definition.yaml
@@ -6,15 +6,5 @@ question: Assumption defines material as findings {tool,file,line,col,rule}
   model accept/reject non-material, heuristic rejections material. Makes
   preserve testable but narrows intent. Architect can proceed for iter1; record
   for operator review.
-status: answered
+status: open
 createdAt: 2026-11-08T01:06:40.587Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.291Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
index ffd7c18..e35fa23 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-human-never-lint-broadening.yaml
@@ -6,15 +6,5 @@ question: Assumption expands never-test-linting to ban subprocess re-lint,
   test_self_lint_clean.py slow gate, guards, config re-checks). M3 lists for
   removal, iter2 removes. Rationale (rot with rule churn) reasonable but deletes
   coverage; operator visibility warranted.
-status: answered
+status: open
 createdAt: 2026-11-08T01:06:40.590Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.289Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
index b1ee1c1..3d8fff6 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-material-definition-needs-awareness.yaml
@@ -5,15 +5,5 @@ question: Assumption defines 4 limbs; reranker decisions not material, heuristic
   rejections material. Model 'only tightens acceptance' may add W9704 under
   default SEMANTIC=1 vs today heuristic-only. Architect decides now; operator
   should know tightening is intentional, not regression.
-status: answered
+status: open
 createdAt: 2026-11-08T00:51:56.275Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.281Z
diff --git a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
index 556ddab..114db9d 100644
--- a/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
+++ b/.factory/tasks/modernize/steer/tousertoreview/awareness-plan-1-never-linting-policy-needs-awareness.yaml
@@ -5,15 +5,5 @@ question: Policy 'pytest never asserts lint-clean; lint gate does' removes
   self-lint guard running all 13 tools on repo. Trades pytest redundancy for
   gate reliance. Architect decides now; operator should know pytest -q alone
   will no longer catch self-lint regressions.
-status: answered
+status: open
 createdAt: 2026-11-08T00:51:56.276Z
-answer: >
-  Operator acknowledges all plan-1 awareness items: (1) material definition and
-  its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is
-  intentional, not a regression. (2) git-stored cache file at the linted repo
-  root: OK as required by INTENT; document it in install docs, keep it
-  detect-secrets clean, and note model weight licenses. (3) never-test-linting
-  broadening and removing the pytest self-lint guard: OK, it matches the
-  project's coding rules; the lint gate is the guard. No further action needed
-  on these.
-answeredAt: 2026-11-08T11:48:08.294Z
diff --git a/AGENTS.md b/AGENTS.md
index ae3db45..0256866 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -6,7 +6,7 @@ This file is the entry point for all AI agents working on python-setup. Read thi
 
 | Command | What it does |
 |---------|-------------|
- | `uv run lint` | Full 13-tool lint pipeline (baseline diffing, ~100s warm, 120s/tool cap) |
+ | `uv run lint` | Full 14-tool lint pipeline (baseline diffing, ~100s warm, 120s/tool cap) |
  | `uv run pytest -q` | Unit tests (1290 pass, 4 skip, 15 deselected, ~53s) |
  | `uv run pytest tests/integration.py -v` | Integration tests (7 pass, ~30s) |
 | `uv run lint --overwrite-baseline --baseline lint.baseline` | Regenerate `lint.baseline` after intentional rule changes |
@@ -40,7 +40,7 @@ This file is the entry point for all AI agents working on python-setup. Read thi
 | `CodingRules.md` | Python coding conventions (shipped to consumers) |
 | `lint.baseline` | Frozen baseline of pre-existing violations |
 | `src/python_setup_lint/runner/cli.py` | Main entry point (`main`, `run_lint`) |
-| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry (13 built-in tools) |
+| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry (14 built-in tools) |
 | `src/python_setup_lint/checkers/_base.py` | Shared checker utilities |
 | `tests/conftest.py` | Shared pytest fixtures |
 | `tests/integration.py` | Fit-for-purpose integration test |
@@ -60,7 +60,7 @@ pyproject.toml → ToolSpec[] → dispatch.run() → per-tool subprocess → res
 Each tool is a `ToolSpec` with name, command, args, config path, and parse strategy. The runner:
 
 1. Loads `pyproject.toml` for extra tools and config overrides
-2. Builds the tool list (13 built-in + any extras)
+2. Builds the tool list (14 built-in + any extras)
 3. Runs each tool sequentially (some tools share resources)
 4. Parses output per-tool (regex, JSON, lines)
 5. Filters against `lint.baseline` (only new violations fail)
@@ -89,8 +89,8 @@ The semantic checker (W9704) detects `Any` in function signatures, unjustified s
 | Layer | Command | Scope |
 |-------|---------|-------|
 | Unit | `uv run pytest -q` | Individual checkers, runner logic, config parsing |
-| Integration | `uv run pytest tests/integration.py -v` | End-to-end: install, lint, update on a sample project. Validates ALL 13 tools + custom checkers fire on planted violations; NOT marked slow; key fit-for-purpose gate. |
-| Lint | `uv run lint` | Self-lint: all 13 tools on python-setup itself |
+| Integration | `uv run pytest tests/integration.py -v` | End-to-end: install, lint, update on a sample project. Validates ALL 14 tools + custom checkers fire on planted violations; NOT marked slow; key fit-for-purpose gate. |
+| Lint | `uv run lint` | Self-lint: all 14 tools on python-setup itself |
 
 ## Common Patterns
 
diff --git a/README.md b/README.md
index a180b8a..48be719 100644
--- a/README.md
+++ b/README.md
@@ -14,7 +14,7 @@ uv run lint
 
 A reusable Python project template that ships:
 
-- **13 lint tools** — tach, ruff, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright (check + verify types), pylint, pylint-pyi, pylint tests, detect-secrets.
+- **14 lint tools** — tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright (check + verify types), pylint, pylint-pyi, pylint tests, detect-secrets.
 - **Shared config** — tool configs live in `python-setup/config/` and are inherited by consumer projects.
 - **Custom pylint checkers** — automatically registered; no manual plugin loading.
 - **Baseline diffing** — `lint.baseline` freezes pre-existing violations; CI only flags new ones.
@@ -55,7 +55,7 @@ Override any shared config via `pyproject.toml` `[tool.*]` sections. See [docs/o
 uv run lint
 ```
 
-Runs all 13 lint tools sequentially with baseline diffing and statistics aggregation.
+Runs all 14 lint tools sequentially with baseline diffing and statistics aggregation.
 
 ### What you get
 
diff --git a/docs/overlays.md b/docs/overlays.md
index c985e01..fb33411 100644
--- a/docs/overlays.md
+++ b/docs/overlays.md
@@ -1,6 +1,6 @@
 # Rule Overlay Configuration
 
-Consumer projects can overlay their own rules on the shared base config. Each tool has its own mechanism — this document covers all 13 shipped tools.
+Consumer projects can overlay their own rules on the shared base config. Each tool has its own mechanism — this document covers all 14 shipped tools.
 
 ## Per-tool overlay reference
 
diff --git a/docs/troubleshooting.md b/docs/troubleshooting.md
index 3456dd6..7d4049f 100644
--- a/docs/troubleshooting.md
+++ b/docs/troubleshooting.md
@@ -152,7 +152,7 @@ uv run pytest tests/integration.py -v
 
 **What it covers:**
 
-- All 13 lint tools fire on planted violations
+- All 14 lint tools fire on planted violations
 - Config overlays work
 - Setup is idempotent
 - Pre-commit hooks validate
diff --git a/docs/tutorials.md b/docs/tutorials.md
index 536e65c..b21b17f 100644
--- a/docs/tutorials.md
+++ b/docs/tutorials.md
@@ -23,7 +23,7 @@ See [troubleshooting.md](troubleshooting.md) if `uv run python-setup install` fa
 uv run lint
 ```
 
-Runs all 13 lint tools sequentially. On a fresh project the first run may produce violations — that's expected.
+Runs all 14 lint tools sequentially. On a fresh project the first run may produce violations — that's expected.
 
 ## 3. Read output
 
diff --git a/src/python_setup_lint/runner/__init__.py b/src/python_setup_lint/runner/__init__.py
index 35ae08a..ecf01b5 100644
--- a/src/python_setup_lint/runner/__init__.py
+++ b/src/python_setup_lint/runner/__init__.py
@@ -1,6 +1,6 @@
 """Python CLI runner for the python-setup lint pipeline.
 
-Replaces ``scripts/lint.sh``.  Runs all 13 lint steps sequentially with
+Replaces ``scripts/lint.sh``.  Runs all 14 lint steps sequentially with
 optional path scoping, fix mode, baseline diffing, flexible failure
 handling, statistics aggregation, declarative extra-tools (T11 v1), and
 autofix (T4).  See ``AGENTS.md`` for the full architecture.
@@ -22,7 +22,12 @@ from __future__ import annotations
 from .baseline import peek_fallback_tools
 from .cli import main, run_lint
 from .dispatch import (
+    EXPECTED_TOOL_NAMES,
+    FORMATTER_ONLY,
     LINT_TOOLS,
+    RECORDLESS_TOOLS,
+    RECORD_PARSER_TOOLS,
+    STATISTICS_PARSER_TOOLS,
     STRATEGIES,
     TOOLS,
     TOOLS_BY_NAME,
@@ -35,8 +40,13 @@ from .parsers import PARSE_STRATEGIES, Record
 from .types import LintResult, RunnerConfig, ToolSpec, ViolationCount
 
 __all__ = [
+    "EXPECTED_TOOL_NAMES",
+    "FORMATTER_ONLY",
     "LINT_TOOLS",
     "PARSE_STRATEGIES",
+    "RECORDLESS_TOOLS",
+    "RECORD_PARSER_TOOLS",
+    "STATISTICS_PARSER_TOOLS",
     "STRATEGIES",
     "TOOLS",
     "TOOLS_BY_NAME",
diff --git a/src/python_setup_lint/runner/__init__.pyi b/src/python_setup_lint/runner/__init__.pyi
index 20a5008..0729461 100644
--- a/src/python_setup_lint/runner/__init__.pyi
+++ b/src/python_setup_lint/runner/__init__.pyi
@@ -1,6 +1,6 @@
 """Python CLI runner for the python-setup lint pipeline.
 
-Replaces ``scripts/lint.sh``.  Runs all 13 lint steps sequentially with
+Replaces ``scripts/lint.sh``.  Runs all 14 lint steps sequentially with
 optional path scoping, fix mode, baseline diffing, flexible failure
 handling, statistics aggregation, declarative extra-tools (T11 v1), and
 autofix (T4).  See ``AGENTS.md`` for the full architecture.
@@ -20,7 +20,12 @@ Public surface
 from .baseline import peek_fallback_tools
 from .cli import main, run_lint
 from .dispatch import (
+    EXPECTED_TOOL_NAMES,
+    FORMATTER_ONLY,
     LINT_TOOLS,
+    RECORDLESS_TOOLS,
+    RECORD_PARSER_TOOLS,
+    STATISTICS_PARSER_TOOLS,
     STRATEGIES,
     TOOLS,
     TOOLS_BY_NAME,
@@ -33,8 +38,13 @@ from .parsers import PARSE_STRATEGIES, Record
 from .types import LintResult, RunnerConfig, ToolSpec, ViolationCount
 
 __all__ = [
+    "EXPECTED_TOOL_NAMES",
+    "FORMATTER_ONLY",
     "LINT_TOOLS",
     "PARSE_STRATEGIES",
+    "RECORDLESS_TOOLS",
+    "RECORD_PARSER_TOOLS",
+    "STATISTICS_PARSER_TOOLS",
     "STRATEGIES",
     "TOOLS",
     "TOOLS_BY_NAME",
diff --git a/src/python_setup_lint/runner/_config.py b/src/python_setup_lint/runner/_config.py
index 6493b31..2382050 100644
--- a/src/python_setup_lint/runner/_config.py
+++ b/src/python_setup_lint/runner/_config.py
@@ -7,6 +7,7 @@ from pathlib import Path
 # Each key is the canonical tool label used in ``_config_flag_for``.
 _SHIPPED_CONFIG_FILES: dict[str, str] = {
     "ruff check": "ruff.toml",
+    "ruff format": "ruff.toml",
     "mypy": "mypy.ini",
     "pylint": ".pylintrc",
     "pylint tests": ".pylintrc-tests",
diff --git a/src/python_setup_lint/runner/cli.py b/src/python_setup_lint/runner/cli.py
index 3528e47..a1c636c 100644
--- a/src/python_setup_lint/runner/cli.py
+++ b/src/python_setup_lint/runner/cli.py
@@ -25,6 +25,7 @@ from ._cli_complexity import (
 )
 from ._cli_helpers import _handle_baseline, _print_tool_notes
 from .dispatch import (
+    FORMATTER_ONLY,
     _strategy_for,  # type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b); runtime import still works
 )
 from .extra_tools import (
@@ -72,11 +73,11 @@ def _run_tool_pipeline(
     if fix and not statistics:
         # ── Phase 1a: format pass (ruff format before fix tools) ──
         for spec in selected:
-            if spec.name != "ruff format":
+            if spec.name not in FORMATTER_ONLY:
                 continue
             _print_tool_notes(spec, fix=False, path=path, exclude=exclude)
             strategy = _strategy_for(spec.name, spec)
-            cmd = strategy.build_command(config=config, _fix=False, _path=path, _exclude=exclude)
+            cmd = strategy.build_format_command(config=config, _path=path, _exclude=exclude)
             result = _run_cmd(cmd, cwd=cwd, label=spec.name)
             _print_result(result)
             if result.exit_code != 0:
@@ -311,7 +312,7 @@ def main(argv: list[str] | None = None, *, config: RunnerConfig | None = None) -
     parser.add_argument(
         "--tools",
         metavar="LIST",
-        help="Comma-separated tool names to run (default: all 13 tools)",
+        help="Comma-separated tool names to run (default: all 14 tools)",
     )
     parser.add_argument(
         "--default-py-dirs",
diff --git a/src/python_setup_lint/runner/cmd_build.py b/src/python_setup_lint/runner/cmd_build.py
index f043726..7d9030e 100644
--- a/src/python_setup_lint/runner/cmd_build.py
+++ b/src/python_setup_lint/runner/cmd_build.py
@@ -12,6 +12,7 @@ if TYPE_CHECKING:
 
 __all__ = [
     "_build_command",
+    "_build_path_and_exclude_args",
     "_build_statistics_flags",
     "_compose_pyright_config",
     "_compose_ruff_config",
@@ -109,6 +110,7 @@ def _config_flag_for(spec_name: str, config_path: Path | None) -> list[str]:
         return []
     flags: dict[str, list[str]] = {
         "ruff check": ["--config", str(config_path)],
+        "ruff format": ["--config", str(config_path)],
         "mypy": ["--config-file", str(config_path)],
         "pylint": ["--rcfile", str(config_path)],
         "pyright check": ["--project", str(config_path)],
diff --git a/src/python_setup_lint/runner/dispatch.py b/src/python_setup_lint/runner/dispatch.py
index 428076a..3476da3 100644
--- a/src/python_setup_lint/runner/dispatch.py
+++ b/src/python_setup_lint/runner/dispatch.py
@@ -8,17 +8,23 @@ from beartype import beartype
 from ._config import _default_config_paths
 from .cmd_build import (
     _build_command,
+    _build_path_and_exclude_args,
     _build_statistics_flags,
     _config_flag_for,
     _find_py_files,
     _find_pyi_files,
     _resolve_pylintrc,
 )
-from .parsers import _STATISTICS_PARSERS
+from .parsers import _RECORD_PARSERS, _STATISTICS_PARSERS
 from .types import RunnerConfig, ToolSpec
 
 __all__ = [
+    "EXPECTED_TOOL_NAMES",
+    "FORMATTER_ONLY",
     "LINT_TOOLS",
+    "RECORDLESS_TOOLS",
+    "RECORD_PARSER_TOOLS",
+    "STATISTICS_PARSER_TOOLS",
     "STRATEGIES",
     "TOOLS",
     "TOOLS_BY_NAME",
@@ -26,6 +32,7 @@ __all__ = [
     "LintTool",
     "_DetectSecretsLintTool",
     "_PylintLintTool",
+    "_RuffFormatLintTool",
     "_StubtestLintTool",
     "_VerifyTypesLintTool",
     "_strategy_for",
@@ -130,6 +137,19 @@ TOOLS: list[ToolSpec] = [
 
 TOOLS_BY_NAME: dict[str, ToolSpec] = {t.name: t for t in TOOLS}
 
+# ── Single-source registry invariants ───────────────────────────────
+# Public constants consumed by the runner and its tests.  Each set is
+# derived from TOOLS or the parser tables so no test hardcodes counts.
+EXPECTED_TOOL_NAMES: frozenset[str] = frozenset(t.name for t in TOOLS)
+FORMATTER_ONLY: frozenset[str] = frozenset({"ruff format"})
+STATISTICS_PARSER_TOOLS: frozenset[str] = frozenset(_STATISTICS_PARSERS)
+RECORD_PARSER_TOOLS: frozenset[str] = frozenset(_RECORD_PARSERS)
+# The complement of RECORD_PARSER_TOOLS: tools whose output has no
+# per-violation record structure (tach/mypy.stubtest/pyright verify
+# types/detect-secrets emit counts or a pass-fail verdict, and
+# ruff format emits only a file-count summary).  Documented intentional.
+RECORDLESS_TOOLS: frozenset[str] = EXPECTED_TOOL_NAMES - RECORD_PARSER_TOOLS
+
 
 class LintTool:
     spec: ToolSpec
@@ -153,6 +173,17 @@ class LintTool:
     ) -> list[str]:
         return _build_command(self.spec, config=config, fix=_fix, path=_path, exclude=_exclude)
 
+    @beartype
+    def build_format_command(
+        self,
+        *,
+        config: RunnerConfig,
+        _path: str | None = None,
+        _exclude: str | None = None,
+    ) -> list[str]:
+        """Mutating command used only by the ``--fix`` phase-1a format pass."""
+        return self.build_command(config=config, _fix=True, _path=_path, _exclude=_exclude)
+
     @beartype
     def statistics_flags(self) -> list[str]:
         return _build_statistics_flags(self.spec)
@@ -166,7 +197,7 @@ class LintTool:
 
 
 # ── Per-tool strategy subclasses ─────────────────────────────────
-# Six built-ins have fundamentally different command shapes that
+# Seven built-ins have fundamentally different command shapes that
 # cannot be expressed via ToolSpec declarative fields alone.  Each
 # overrides ``build_command`` with tool-specific logic, eliminating
 # ``if spec.name ==`` branches from ``_build_command``.
@@ -371,8 +402,46 @@ class _PylintTestsLintTool(LintTool):
         return cmd
 
 
+class _RuffFormatLintTool(LintTool):
+    """``ruff format`` is check-only on normal passes; only phase 1a mutates."""
+
+    def _build(self, *, mode: str | None, config: RunnerConfig, path: str | None, exclude: str | None) -> list[str]:
+        cmd = [*self.spec.command]
+        if mode is not None:
+            cmd.append(mode)
+        config_path = (config.config_paths or {}).get(self.spec.name)
+        if config_path is None:
+            config_path = _default_config_paths(config.cwd).get(self.spec.name)
+        cmd.extend(_config_flag_for(self.spec.name, config_path))
+        cmd.extend(_build_path_and_exclude_args(self.spec, config=config, path=path, exclude=exclude))
+        return cmd
+
+    @beartype
+    def build_command(
+        self,
+        *,
+        config: RunnerConfig,
+        _fix: bool = False,
+        _path: str | None = None,
+        _exclude: str | None = None,
+    ) -> list[str]:
+        _ = _fix  # normal passes never mutate; mutation lives in build_format_command
+        return self._build(mode="--check", config=config, path=_path, exclude=_exclude)
+
+    @beartype
+    def build_format_command(
+        self,
+        *,
+        config: RunnerConfig,
+        _path: str | None = None,
+        _exclude: str | None = None,
+    ) -> list[str]:
+        return self._build(mode=None, config=config, path=_path, exclude=_exclude)
+
+
 # Populate the strategy registry from the 14 built-ins.
 _STRATEGY_CLASSES: dict[str, type[LintTool]] = {
+    "ruff format": _RuffFormatLintTool,
     "mypy.stubtest": _StubtestLintTool,
     "pyright verify types": _VerifyTypesLintTool,
     "detect-secrets": _DetectSecretsLintTool,
diff --git a/src/python_setup_lint/runner/dispatch.pyi b/src/python_setup_lint/runner/dispatch.pyi
index 7c312ba..a9d0d02 100644
--- a/src/python_setup_lint/runner/dispatch.pyi
+++ b/src/python_setup_lint/runner/dispatch.pyi
@@ -1,8 +1,8 @@
 """Stub for :mod:`python_setup_lint.runner.dispatch`.
 
-Six built-ins override ``build_command`` for tool-specific command shapes
-(``mypy.stubtest``, ``pyright verify types``, ``detect-secrets``, ``pylint``);
-the rest inherit the default delegation to
+Seven built-ins override ``build_command`` for tool-specific command shapes
+(``ruff format``, ``mypy.stubtest``, ``pyright verify types``,
+``detect-secrets``, ``pylint``); the rest inherit the default delegation to
 :mod:`python_setup_lint.runner.cmd_build`.
 """
 
@@ -16,6 +16,24 @@ TOOLS: list[ToolSpec]
 TOOLS_BY_NAME: dict[str, ToolSpec]
 """Tool specs keyed by name for fast lookup (built-ins only)."""
 
+EXPECTED_TOOL_NAMES: frozenset[str]
+"""Names of all 14 built-in tools, derived from :data:`TOOLS`."""
+
+FORMATTER_ONLY: frozenset[str]
+"""Built-ins that only format (``ruff format``); exempt from parser coverage."""
+
+STATISTICS_PARSER_TOOLS: frozenset[str]
+"""Built-ins with a statistics parser in
+:data:`python_setup_lint.runner.parsers._STATISTICS_PARSERS`."""
+
+RECORD_PARSER_TOOLS: frozenset[str]
+"""Built-ins with a per-violation record parser in
+:data:`python_setup_lint.runner.parsers._RECORD_PARSERS`."""
+
+RECORDLESS_TOOLS: frozenset[str]
+"""Built-ins without a record parser: ``tach check``, ``mypy.stubtest``,
+``pyright verify types``, ``detect-secrets``, and ``ruff format``."""
+
 LINT_TOOLS: list[ToolSpec]
 """Live registry of declared ``ToolSpec`` instances — built-ins plus any
 extras registered via :func:`register_lint_tool`.  At import time it
@@ -59,6 +77,13 @@ class LintTool:
         _path: str | None = None,
         _exclude: str | None = None,
     ) -> list[str]: ...
+    def build_format_command(
+        self,
+        *,
+        config: RunnerConfig,
+        _path: str | None = None,
+        _exclude: str | None = None,
+    ) -> list[str]: ...
     def statistics_flags(self) -> list[str]: ...
     def parse_statistics(self, stdout: str, stderr: str) -> list[tuple[str, int]]: ...
 
diff --git a/src/python_setup_lint/runner/types.pyi b/src/python_setup_lint/runner/types.pyi
index 5eaf4a5..b39c89d 100644
--- a/src/python_setup_lint/runner/types.pyi
+++ b/src/python_setup_lint/runner/types.pyi
@@ -80,7 +80,7 @@ class RunnerConfig:
         default_py_dirs: Default directories for pylint ``_find_py_files``
             discovery when no ``--path`` is given.
         tools_override: Optional list of tool names to run.  ``None``
-            runs all 13 default tools.  Unknown names raise
+            runs all 14 default tools.  Unknown names raise
             :class:`python_setup_lint.runner.extra_tools.ExtraToolsConfigError`
             (T8 fail-fast) rather than silently running a subset.
         tool_timeouts: Per-tool timeout overrides (seconds). Tool name → int.
diff --git a/tests/runner/_factories.py b/tests/runner/_factories.py
index c398233..c4277b8 100644
--- a/tests/runner/_factories.py
+++ b/tests/runner/_factories.py
@@ -31,23 +31,36 @@ if TYPE_CHECKING:
 InstallFakeFn = Callable[..., Any]
 
 
-# The 13 built-in tool names — used both for the canned-results factory
+# The 14 built-in tool names — used both for the canned-results factory
 # (dict-mode ``FakeRunCmd``) and for the "every tool dispatched" assertion
 # in the orchestration tests.
 ALL_TOOL_NAMES: frozenset[str] = frozenset(t.name for t in TOOLS)
 
 
+def runner_registry_constant(name: str) -> frozenset[str]:
+    """Return public tool-registry constant *name*, asserting the runner re-exports it.
+
+    Kept as a runtime lookup so a missing export fails the owning test with a
+    clear assertion instead of aborting collection for the whole module.
+    """
+    import python_setup_lint.runner as runner_pkg
+
+    value = getattr(runner_pkg, name, None)
+    assert value is not None, f"python_setup_lint.runner must re-export {name}"
+    return frozenset(value)
+
+
 def canned_results_all_tools(
     *,
     exit_code: int = 0,
     stdout: str = "",
     overrides: Mapping[str, LintResult] | None = None,
 ) -> dict[str, LintResult]:  # pylint: disable=generic-key-dict  # dict[str, LintResult] is a test helper; string keys are tool labels
-    """Build the 13-tool canned-result dict for ``fake_run_cmd_factory``.
+    """Build the 14-tool canned-result dict for ``fake_run_cmd_factory``.
 
     Every built-in label maps to a ``LintResult`` with defaults; pass
     *overrides* to vary any subset. Used by the orchestration / smoke
-    tests so they stop repeating the 13-key dict literal.
+    tests so they stop repeating the 14-key dict literal.
     """
     # Late import to avoid any conftest-collection ordering surprise.
     from python_setup_lint.testing import make_lint_result
diff --git a/tests/runner/_factories_extras.py b/tests/runner/_factories_extras.py
index b9e44de..7adc178 100644
--- a/tests/runner/_factories_extras.py
+++ b/tests/runner/_factories_extras.py
@@ -1,4 +1,4 @@
-# pylint: disable=too-many-lines  # 502 lines — factory data for 13 tools; splitting would lose context
+# pylint: disable=too-many-lines  # 502 lines — factory data for 14 tools; splitting would lose context
 """Extra-tools, dispatch, and small parametrize tables for python-setup runner tests.
 
 Moved from ``_factories.py`` to keep each file under 500 lines (pylint C0302).
@@ -371,16 +371,25 @@ CALLS_CAPTURED_CASES: list[ParameterSet] = [
 ]
 
 # Smoke-integration invariant table.
+
+
+def _expected_dispatched_tool_count(*, skipped: frozenset[str] = frozenset()) -> int:
+    """Count built-in tools minus *skipped*, read from the public registry."""
+    from ._factories import runner_registry_constant
+
+    return len(runner_registry_constant("EXPECTED_TOOL_NAMES") - skipped)
+
+
 RUN_LINT_FAKE_INVARIANT_CASES: list[ParameterSet] = [
     pytest.param(
         {"path": "src/python_setup_lint/runner.py"},
-        lambda f: len(f.calls) == 13 and all(len(c.cmd) > 0 and c.label for c in f.calls),
-        id="all_13_tools_dispatched",
+        lambda f: len(f.calls) == _expected_dispatched_tool_count() and all(len(c.cmd) > 0 and c.label for c in f.calls),
+        id="all_14_tools_dispatched",
     ),
     pytest.param(
         {"path": "src/python_setup_lint/runner.py", "fix": True},
         lambda f: all(
-            any("--fix" in c.cmd for c in f.calls if c.label == name) for name in {"ruff check", "rumdl check", "ty check"}
+            any("--fix" in c.cmd for c in f.calls if c.label == name) for name in ("ruff check", "rumdl check", "ty check")
         ),
         id="fix_flag_propagates_to_supports_fix_labels",
     ),
@@ -396,7 +405,7 @@ RUN_LINT_FAKE_INVARIANT_CASES: list[ParameterSet] = [
     pytest.param(
         {"package_name": None, "path": "src/python_setup_lint/runner.py"},
         lambda f: (
-            len(f.calls) == 11
+            len(f.calls) == _expected_dispatched_tool_count(skipped=frozenset({"mypy.stubtest", "pyright verify types"}))
             and "mypy.stubtest" not in {c.label for c in f.calls}
             and "pyright verify types" not in {c.label for c in f.calls}
         ),
diff --git a/tests/runner/test_bench_runner_overhead.py b/tests/runner/test_bench_runner_overhead.py
index 20fe6d3..7054376 100644
--- a/tests/runner/test_bench_runner_overhead.py
+++ b/tests/runner/test_bench_runner_overhead.py
@@ -2,7 +2,7 @@
 """Benchmark: per-tool time/memory + runner overhead measurement.
 
 ``@pytest.mark.slow`` — excluded from ``-m "not slow"`` runs.  Spawns real
-subprocesses for all 13 lint tools (pylint ×3 configurations) on a minimal
+subprocesses for all 14 lint tools (pylint ×3 configurations) on a minimal
 synthetic project.  Writes ``tmp_path/bench-runner-overhead.md`` with the
 per-tool time/memory table and the runner-overhead before/after numbers.
 
@@ -221,7 +221,7 @@ def test_bench_runner_overhead_given_tmp_path_then_within_threshold(tmp_path: Pa
             "`extra_tools.py:348-360`) so that repeated `run_lint` invocations "
             "in the same process reuse the cached parse. Overhead was already "
             "negligible before any memoisation (T11 PoW baseline 0.001s) and "
-            "remains negligible because per-process tool-dispatch is N=13 tool "
+            "remains negligible because per-process tool-dispatch is N=14 tool "
             "spec entries already in memory.",
             "",
             "## Verification Gate",
diff --git a/tests/runner/test_extra_tools.py b/tests/runner/test_extra_tools.py
index db01450..a464512 100644
--- a/tests/runner/test_extra_tools.py
+++ b/tests/runner/test_extra_tools.py
@@ -234,7 +234,7 @@ class TestExtraToolsMerge:
         _register_extra_tools([_X1, _X2])
         names = {t.name for t in LINT_TOOLS}
         assert {"x1", "x2"} <= names
-        assert set(TOOLS_BY_NAME) <= names  # all 13 built-ins remain post-merge
+        assert set(TOOLS_BY_NAME) <= names  # all 14 built-ins remain post-merge
 
     def test_extra_tools_merge_given_builtin_name_collision_then_rejects(self) -> None:
         collision = _ExtraToolRegistration(
diff --git a/tests/runner/test_lint_runner.py b/tests/runner/test_lint_runner.py
index bddedc2..be8620d 100644
--- a/tests/runner/test_lint_runner.py
+++ b/tests/runner/test_lint_runner.py
@@ -47,11 +47,12 @@ _CONFIG = RunnerConfig(cwd=Path.cwd())
 
 
 class TestToolSpec:
-    """The static 13-tool table invariant."""
+    """The static 14-tool table invariant."""
 
     def test_tool_spec_given_known_tools_then_present(self) -> None:
         assert {t.name for t in TOOLS} == {
             "tach check",
+            "ruff format",
             "ruff check",
             "rumdl check",
             "mypy",
@@ -73,7 +74,7 @@ class TestToolSpec:
             "ty check",
         }
         assert all(t.name for t in TOOLS)
-        assert len({t.name for t in TOOLS}) == len(TOOLS) == 13
+        assert len({t.name for t in TOOLS}) == len(TOOLS) == 14
 
     def test_tool_spec_given_yamllint_then_default_paths_is_dot(self) -> None:
         """yamllint default_paths changed from config/*.yaml to . (T5 fix)."""
diff --git a/tests/runner/test_lint_runner_stats.py b/tests/runner/test_lint_runner_stats.py
index 58b7481..ff92bb2 100644
--- a/tests/runner/test_lint_runner_stats.py
+++ b/tests/runner/test_lint_runner_stats.py
@@ -28,7 +28,7 @@ from python_setup_lint.runner._config import _SUPPORTED_CONFIG_KEYS
 from python_setup_lint.runner.cmd_build import _build_command, _build_statistics_flags
 from python_setup_lint.runner.output import _print_statistics_grouped, _sort_counts
 from python_setup_lint.runner.parsers import _STATISTICS_PARSERS
-from tests.runner._factories import install_fake_runner, lint_config, write_pyproject
+from tests.runner._factories import install_fake_runner, lint_config, runner_registry_constant, write_pyproject
 from tests.runner._factories_extras import (
     CLEAN_EXTRAS_PYPROJECT_BODY,
     GROUPED_OUTPUT_CASES,
@@ -70,7 +70,10 @@ def test_statistics_parser(tool_name: str, stdout: str, stderr: str, expected: l
 
 
 def test_statistics_parsers_given_all_tools_then_covered() -> None:
-    assert {t.name for t in TOOLS} <= set(_STATISTICS_PARSERS)
+    formatter_only = runner_registry_constant("FORMATTER_ONLY")
+    statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
+    assert statistics_tools == frozenset(_STATISTICS_PARSERS)
+    assert {t.name for t in TOOLS} - formatter_only == statistics_tools
 
 
 def test_parse_strategies_given_stats_then_includes_all_keys() -> None:
@@ -218,7 +221,7 @@ class TestT8FailFastConfig:
 
 
 class TestLintToolRegistry:
-    """STRATEGIES/LINT_TOOLS mirror the 13 built-ins AND strategies are LintTool instances."""
+    """STRATEGIES/LINT_TOOLS mirror the 14 built-ins AND strategies are LintTool instances."""
 
     @pytest.mark.parametrize(
         "registry",
diff --git a/tests/runner/test_real_pipeline_smoke.py b/tests/runner/test_real_pipeline_smoke.py
index 7ad46d9..671821a 100644
--- a/tests/runner/test_real_pipeline_smoke.py
+++ b/tests/runner/test_real_pipeline_smoke.py
@@ -21,7 +21,7 @@ def test_consolidated_real_pipeline_smoke(
 
     Asserts:
     - ``isinstance(rc, int)`` — the pipeline ran to completion.
-    - All 13 tools appear in the printed output (captured via capsys).
+    - All 14 tools appear in the printed output (captured via capsys).
     """
     src = tmp_path / "src"
     src.mkdir()
diff --git a/tests/runner/test_runner_format_contract.py b/tests/runner/test_runner_format_contract.py
new file mode 100644
index 0000000..767cc7b
--- /dev/null
+++ b/tests/runner/test_runner_format_contract.py
@@ -0,0 +1,174 @@
+"""ADR-005 contract tests: ``ruff format`` modes + single-source 14-tool registry.
+
+The runner keeps 14 built-in tools — 13 analysis/format-check tools plus the
+``ruff format`` formatter.  Normal (non-fix) passes must run the formatter in
+check mode; only the fix-only phase may mutate files.  Registry constants are
+owned by :mod:`python_setup_lint.runner.dispatch` and re-exported from
+:mod:`python_setup_lint.runner` so tests, docs and dispatch share one source.
+"""
+
+from __future__ import annotations
+
+import json
+from collections.abc import Callable
+from pathlib import Path
+from typing import cast
+
+import pytest
+
+import python_setup_lint.runner.output as _output_module
+from python_setup_lint.runner import STRATEGIES, TOOLS, RunnerConfig, run_lint
+from python_setup_lint.runner._config import _default_config_paths
+from python_setup_lint.runner.cmd_build import _config_flag_for
+from python_setup_lint.testing import FakeRunCmd, fake_run_cmd_factory
+from tests.runner._factories import canned_results_all_tools, runner_registry_constant
+
+pytestmark = pytest.mark.no_external_api
+
+_CONFIG = RunnerConfig(cwd=Path.cwd())
+_GOLDEN_COUNTS = Path(__file__).resolve().parent.parent / "data" / "golden" / "minimal_sample_project_tool_counts.json"
+
+_EXPECTED_TOOL_NAMES = frozenset(
+    {
+        "tach check",
+        "ruff format",
+        "ruff check",
+        "rumdl check",
+        "mypy",
+        "yamllint",
+        "ty check",
+        "mypy.stubtest",
+        "pyright check",
+        "pyright verify types",
+        "pylint",
+        "pylint-pyi",
+        "pylint tests",
+        "detect-secrets",
+    }
+)
+_FORMATTER_ONLY = frozenset({"ruff format"})
+_RECORDLESS_TOOLS = frozenset({"tach check", "mypy.stubtest", "pyright verify types", "detect-secrets", "ruff format"})
+_REGISTRY_CONSTANT_NAMES = (
+    "EXPECTED_TOOL_NAMES",
+    "FORMATTER_ONLY",
+    "STATISTICS_PARSER_TOOLS",
+    "RECORD_PARSER_TOOLS",
+    "RECORDLESS_TOOLS",
+)
+
+
+class TestRuffFormatStrategy:
+    """``ruff format`` is check-only on normal passes and mutates only in fix phase 1a."""
+
+    def test_ruff_format_build_command_given_normal_pass_then_check_mode(self) -> None:
+        cmd = STRATEGIES["ruff format"].build_command(config=_CONFIG)
+        assert cmd[:3] == ["ruff", "format", "--check"], f"normal pass must run check mode, got {cmd!r}"
+        assert "--config" in cmd, f"normal pass must pin the shipped ruff config, got {cmd!r}"
+        config_index = cmd.index("--config")
+        config_path = Path(cmd[config_index + 1])
+        assert config_path.is_file(), f"resolved ruff config must exist: {config_path}"
+        assert config_path.name == "ruff.toml"
+
+    def test_ruff_format_build_format_command_given_fix_pass_then_mutating_mode(self) -> None:
+        build_format_command = getattr(STRATEGIES["ruff format"], "build_format_command", None)
+        assert callable(build_format_command), "ruff format strategy must expose build_format_command"
+        cmd: list[str] = cast("Callable[..., list[str]]", build_format_command)(config=_CONFIG)
+        assert cmd[:2] == ["ruff", "format"]
+        assert "--check" not in cmd, f"fix phase must mutate, got {cmd!r}"
+        assert "--config" in cmd, f"fix phase must pin the shipped ruff config, got {cmd!r}"
+        config_index = cmd.index("--config")
+        assert Path(cmd[config_index + 1]).is_file()
+
+
+class TestRuffFormatConfig:
+    """``ruff format`` participates in shipped-config discovery and flag mapping."""
+
+    def test_default_config_paths_given_ruff_format_then_ruff_toml(self) -> None:
+        paths = _default_config_paths(Path.cwd())
+        assert "ruff format" in paths, f"shipped config discovery missing ruff format: {sorted(paths)}"
+        assert paths["ruff format"].name == "ruff.toml"
+
+    def test_config_flag_for_ruff_format_then_config_flag(self, tmp_path: Path) -> None:
+        ruff_toml = tmp_path / "ruff.toml"
+        ruff_toml.write_text("", encoding="utf-8")
+        assert _config_flag_for("ruff format", ruff_toml) == ["--config", str(ruff_toml)]
+
+
+class TestRegistryConstants:
+    """Built-in registry constants are exported from the runner package."""
+
+    def test_expected_tool_names_given_exported_then_matches_builtins(self) -> None:
+        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
+        assert names == _EXPECTED_TOOL_NAMES
+        assert names == {t.name for t in TOOLS}
+        assert len(names) == 14
+
+    def test_formatter_only_and_statistics_parser_tools_partition_all_tools(self) -> None:
+        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
+        formatter_only = runner_registry_constant("FORMATTER_ONLY")
+        statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
+        assert formatter_only == _FORMATTER_ONLY
+        assert len(statistics_tools) == 13
+        assert statistics_tools == names - formatter_only
+
+    def test_record_parser_and_recordless_tools_partition_all_tools(self) -> None:
+        names = runner_registry_constant("EXPECTED_TOOL_NAMES")
+        record_tools = runner_registry_constant("RECORD_PARSER_TOOLS")
+        recordless = runner_registry_constant("RECORDLESS_TOOLS")
+        assert len(record_tools) == 9
+        assert recordless == _RECORDLESS_TOOLS
+        assert record_tools == names - recordless
+
+    def test_registry_constants_then_match_parser_tables(self) -> None:
+        from python_setup_lint.runner.parsers import _RECORD_PARSERS, _STATISTICS_PARSERS
+
+        assert runner_registry_constant("STATISTICS_PARSER_TOOLS") == frozenset(_STATISTICS_PARSERS)
+        assert runner_registry_constant("RECORD_PARSER_TOOLS") == frozenset(_RECORD_PARSERS)
+
+    def test_registry_constants_given_runner_then_alias_dispatch_objects(self) -> None:
+        import python_setup_lint.runner as runner_pkg
+        from python_setup_lint.runner import dispatch
+
+        for name in _REGISTRY_CONSTANT_NAMES:
+            value = getattr(runner_pkg, name, None)
+            assert value is not None, f"python_setup_lint.runner must re-export {name}"
+            assert getattr(dispatch, name, None) is value, f"{name} must be owned by dispatch and re-exported unchanged"
+
+
+def _run_with_fake(monkeypatch: pytest.MonkeyPatch, *, fix: bool = False) -> FakeRunCmd:
+    """Run ``run_lint`` with a dict-mode fake and return the call recorder."""
+    fake = fake_run_cmd_factory(canned_results_all_tools())
+    monkeypatch.setattr(_output_module, "_run_cmd", fake)
+    config = RunnerConfig(cwd=Path.cwd(), package_name="python_setup_lint")
+    rc = run_lint(config=config, path="src/python_setup_lint/runner.py", fix=fix)
+    assert isinstance(rc, int)
+    return fake
+
+
+class TestPipelineModes:
+    """Only ``--fix`` may mutate files; normal passes are check-only."""
+
+    def test_run_lint_without_fix_runs_ruff_format_check_only(self, monkeypatch: pytest.MonkeyPatch) -> None:
+        fake = _run_with_fake(monkeypatch)
+        format_calls = [call.cmd for call in fake.calls if call.label == "ruff format"]
+        assert len(format_calls) == 1, f"normal pass must run ruff format exactly once, got {format_calls!r}"
+        assert "--check" in format_calls[0], f"normal pass must not mutate, got {format_calls[0]!r}"
+        assert "--config" in format_calls[0], f"normal pass must use the shipped config, got {format_calls[0]!r}"
+
+    def test_run_lint_with_fix_formats_first_then_checks(self, monkeypatch: pytest.MonkeyPatch) -> None:
+        fake = _run_with_fake(monkeypatch, fix=True)
+        format_calls = [call.cmd for call in fake.calls if call.label == "ruff format"]
+        assert len(format_calls) == 2, f"fix phase + lint pass must each run ruff format, got {format_calls!r}"
+        mutate_cmd, check_cmd = format_calls
+        assert "--check" not in mutate_cmd, f"phase 1a must mutate, got {mutate_cmd!r}"
+        assert "--check" in check_cmd, f"lint pass must check, got {check_cmd!r}"
+        assert "--config" in mutate_cmd and "--config" in check_cmd
+
+
+class TestGoldenToolCounts:
+    """Committed golden counts stay in lockstep with the 14-tool registry."""
+
+    def test_tool_counts_file_given_registry_then_14_keys_and_ruff_format_zero(self) -> None:
+        counts: dict[str, int] = json.loads(_GOLDEN_COUNTS.read_text(encoding="utf-8"))
+        assert set(counts) == {t.name for t in TOOLS}
+        assert counts["ruff format"] == 0
diff --git a/tests/runner/test_self_lint_clean.py b/tests/runner/test_self_lint_clean.py
index b1506e5..c2d0797 100644
--- a/tests/runner/test_self_lint_clean.py
+++ b/tests/runner/test_self_lint_clean.py
@@ -1,6 +1,6 @@
 """Guard against python-setup's own self-lint regression.
 
-Runs the full lint pipeline (all 13 tools) against the python-setup repo root
+Runs the full lint pipeline (all 14 tools) against the python-setup repo root
 with the shipped config.  A self-lint regression (new violation, crash, or
 unexpected skip) fails this test rather than slipping into CI.
 """
diff --git a/tests/runner/test_t3_coverage.py b/tests/runner/test_t3_coverage.py
index e5cf65b..043fb49 100644
--- a/tests/runner/test_t3_coverage.py
+++ b/tests/runner/test_t3_coverage.py
@@ -21,56 +21,37 @@ from python_setup_lint.runner.parsers import (
     _parse_yamllint_parsable,
 )
 from python_setup_lint.testing import fake_run_cmd_factory, make_lint_result
+from tests.runner._factories import runner_registry_constant
 
 if TYPE_CHECKING:
     import pytest
 
-# ── All TOOLS must have a registered parser ────────────────────────
+# ── All non-formatter tools must have a registered parser ──────────
 
 
 class TestParserCompleteness:
-    """Every tool in TOOLS must have a corresponding statistics parser."""
-
-    # Replicate the parser dispatch dict here to catch drift
-    # (importing a private symbol is OK in the same package tests)
-    EXPECTED_PARSER_TOOLS = {
-        "ruff check",
-        "rumdl check",
-        "pylint",
-        "pylint-pyi",
-        "pylint tests",
-        "pyright check",
-        "pyright verify types",
-        "mypy",
-        "ty check",
-        "tach check",
-        "yamllint",
-        "mypy.stubtest",
-        "detect-secrets",
-    }
+    """Every non-formatter tool in TOOLS must have a corresponding statistics parser."""
 
     def test_parser_completeness_given_all_tools_then_have_parser(self) -> None:
         """Every TOOLS entry has a statistics parser registered."""
         tool_names = {t.name for t in TOOLS}
-        missing = tool_names - self.EXPECTED_PARSER_TOOLS
+        missing = tool_names - runner_registry_constant("FORMATTER_ONLY") - runner_registry_constant("STATISTICS_PARSER_TOOLS")
         assert not missing, f"TOOLS missing statistics parsers: {missing}"
 
     def test_parser_completeness_given_all_parsers_then_correspond_to_tools(self) -> None:
         """Every registered parser tool name exists in TOOLS."""
         tool_names = {t.name for t in TOOLS}
-        extra = self.EXPECTED_PARSER_TOOLS - tool_names
+        extra = runner_registry_constant("STATISTICS_PARSER_TOOLS") - tool_names
         assert not extra, f"Parsers exist for unknown tools: {extra}"
 
     def test_parser_completeness_given_statistics_flags_then_align_with_parsers(self) -> None:
         """Tools with a statistics parser also have non-empty flags."""
-        has_flags = set()
-        for spec in TOOLS:
-            if _build_statistics_flags(spec):
-                has_flags.add(spec.name)
+        has_flags = {spec.name for spec in TOOLS if _build_statistics_flags(spec)}
         # pyright verify types, mypy.stubtest, detect-secrets have no extra flags
         # but still have parsers
-        assert has_flags <= self.EXPECTED_PARSER_TOOLS
-        no_flag_but_parser = self.EXPECTED_PARSER_TOOLS - has_flags
+        statistics_tools = runner_registry_constant("STATISTICS_PARSER_TOOLS")
+        assert has_flags <= statistics_tools
+        no_flag_but_parser = statistics_tools - has_flags
         assert no_flag_but_parser <= {
             "pyright verify types",
             "mypy.stubtest",
diff --git a/tests/runner/test_testing_fakes.py b/tests/runner/test_testing_fakes.py
index 8c56a6f..54a41ba 100644
--- a/tests/runner/test_testing_fakes.py
+++ b/tests/runner/test_testing_fakes.py
@@ -130,11 +130,11 @@ def test_fake_run_cmd_direct_construction(results: Any, label: str, expected_exi
 # Parametrised (kwargs, predicate) invariant table. Each row asserts a
 # distinct behavioural invariant of ``run_lint`` with the fake installed
 # (tool count, --fix propagation, --exclude propagation, package_name=None
-# skip). Uses ``canned_results_all_tools()`` to avoid the 13-key dict literal.
+# skip). Uses ``canned_results_all_tools()`` to avoid the 14-key dict literal.
 
 
 def _install_fake_and_run(monkeypatch: pytest.MonkeyPatch, **run_lint_kwargs: Any) -> FakeRunCmd:
-    """Install a 13-tool dict-mode ``FakeRunCmd`` + invoke ``run_lint``.
+    """Install a 14-tool dict-mode ``FakeRunCmd`` + invoke ``run_lint``.
 
     ``package_name=None`` ⇒ skip stubtest+verifytypes. Returns ``fake`` for assertion.
     Resets ``LINT_TOOLS`` to built-in ``TOOLS`` to avoid cross-test pollution.
@@ -162,7 +162,7 @@ def test_run_lint_with_fake_dispatch_invariants(
     predicate: Callable[[FakeRunCmd], bool],
     isolated_runner_registries: None,
 ) -> None:
-    """One ``run_lint(...)`` + 13-tool fake; the row's predicate asserts the invariant."""
+    """One ``run_lint(...)`` + 14-tool fake; the row's predicate asserts the invariant."""
     fake = _install_fake_and_run(monkeypatch, **run_lint_kwargs)
     assert predicate(fake), f"Invariant failed; calls={[c.label for c in fake.calls]}"

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
