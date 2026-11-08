# Step: Infra

## Goal
Discover project infrastructure, worktree bootstrap commands, test runner configuration, and quality gates.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Validate commands: Probe candidate commands with `bash`. Record red gates as-is, do NOT investigate or fix: If gates fail or are red on a clean checkout, record them as they are — the engine records baseline gate status and ratchets against regressions; do NOT hunt for workarounds, do NOT investigate failure causes, and do NOT search outside the repository. The target repository may be the factory itself — still only record, never investigate or fix engine internals.
- Orchestration-folder lint noise: when a gate's failures come from `{orchestrationFolder}` files (`.factory/**` or configured orchestration folder, such as `input.md`, `INTENT.md`, or harness records), declare the gate command with the tool's exclude option if one exists (e.g. `--exclude .factory`). If no exclude option exists for the tool, declare the gate as-is and report it in `notes: string[]` as an operator action.
- Gate mutation rule: quality gates MUST NOT mutate the worktree. Always declare check-only flags (e.g. `ruff format --check` instead of `ruff format`).
- Sizing: Setup commands should be minimal (≤3, empty `[]` if standard checkout works).
- Containment: Work ONLY inside `cwd`. Never search outside the repository root.
- Yield structured output matching `infra.schema.json`.

## Output Fields Specification
- `setup`: Minimal shell commands to prepare a fresh worktree (e.g. `["npm install"]` or `[]`).
- `gates`: Array of `{ "id": "...", "command": "..." }` for project checks (typecheck, lint, tests). Record existing gates as defined in the repository, even if currently failing on clean checkout.
- `testRunner.command`: Base test command, e.g. `"pytest"` or `"bun test"`.
- `testRunner.selectorArgs`: Flags to specify targeted test names/selectors, e.g. `["-k"]` for pytest, `["-t"]` for jest, or `[]` if positional.
- `testRunner.junitArg`: Argument format for writing JUnit XML report, e.g. `"--junitxml={path}"` for pytest. The engine replaces `{path}` with the temporary JUnit report path.
- `notes`: Optional array of strings detailing operator actions or configuration suggestions (e.g. advising to exclude the orchestration folder from project linters/formatters).
## Task
{{task}}

## Intent
{{intent}}

## Context
{{context}}
