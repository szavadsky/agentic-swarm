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
  "slug": "consolidate-integration-helpers-i2",
  "kind": "test-only",
  "title": "Single-source helpers; integration.py under 500 lines",
  "assignment": "GOAL: Single-source test project helpers and bring integration.py to 500 lines or less. SCOPE: tests only. FORBIDDEN: lint.baseline, AGENTS.md, docs, src. Red-test-exempt. STEPS: Create tests/_project_helpers.py as sole site with 11 pinned helpers: copy_sample_project(dest_parent: Path) to Path with mkdir parents plus copytree tests/data/minimal_sample_project to dest_parent/project (ex _copy_sample), git_init_and_stage(project) to None with test/test@test plus add dot (ex _init_git), shipped_config_paths to dict (ex _shipped_config_paths), make_runner_config(project) to RunnerConfig with minimal_sample plus rumdl override idempotent no-op if shipped rumdl missing (ex _make_config), git_init_bare(cwd) to None with Test/test@example.com -q no add (ex _git_init), write_project_file(cwd,rel,content) to Path (ex _write_file), stage_file(cwd,rel) to None (ex _stage), commit_all(cwd,msg init) to None (ex _commit_all), build_pylint_overlay_config(project,disable_rule) to Path extracting overlay 217-240, ensure_precommit_or_skip to None, install_twice_assert_idempotent(project,monkeypatch) to None. STAY in _autofix_helpers.py untouched: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES plus assert. Delete shipped_config_paths def entirely from tests/conftest.py with no re-export; rewrite test_pyright_noise_filter.py:15 and test_self_lint_clean.py:15 to from tests._project_helpers import ...; integration.py consumes make_runner_config plus mapped subset only. Cycle guard: _project_helpers imports stdlib plus python_setup_lint.runner/setup/testing only, never tests.conftest or tests.integration. Keep test class and function names unchanged; helper renames per matrix only. Budget: remove at least 161 lines (661 to 500 or less): helpers 57 plus overlay 28 plus setup/idempotent 32 plus precommit 30 plus loop/lookup 5 plus slicer 3 plus import/trim 8 equals 163. Remove :12 too-many-lines via extraction; delete :202 stale too-many-locals disable directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests plus W9704 clean). VERIFY: diff stat shows tests only, golden diff empty, pytest tests/integration.py -v passes, test_golden passes, touched files format-clean.",
  "outlineRef": "consolidate-integration-helpers",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2-1",
    "M2-2"
  ],
  "citations": [
    "CodingRules.md:230-306",
    "CodingRules.md:139-159",
    "AGENTS.md:87-93",
    "pyproject.toml:49-49"
  ]
}

## Target
tests

## Context & Citations
[
  "CodingRules.md:230-306",
  "CodingRules.md:139-159",
  "AGENTS.md:87-93",
  "pyproject.toml:49-49"
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
