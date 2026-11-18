# Step: Test-First

## Goal
Author automated tests specifying the required behavior changes BEFORE writing production code.

## Rules
- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
- Target declaration in yield:
  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
- Output: yield structured output per `developer-output.schema.json`.

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
