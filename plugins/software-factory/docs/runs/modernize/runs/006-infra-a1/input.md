# Step: Infra

## Goal
Discover project infrastructure, worktree bootstrap commands, test runner configuration, and quality gates.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Validate commands: Probe candidate commands with `bash`. If gates fail or are red on a clean checkout, record them as they are — the engine records baseline gate status and ratchets against regressions; do NOT hunt for workarounds or search outside the repository.
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
modernize

## Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.


## Context
{
  "citations": [
    {
      "file": "src/python_setup_lint/checkers/_semantic.py",
      "lines": "1-12",
      "anchors": [
        "Cross-encoder reranking",
        "sentence-transformers"
      ],
      "summary": "Module purpose: single-stage NLP justification pipeline built on a cross-encoder reranker, lazily loaded with heuristic fallback on failure."
    },
    {
      "file": "src/python_setup_lint/checkers/_semantic.py",
      "lines": "37-52",
      "anchors": [
        "_CACHE_DIR",
        "_RERANKER_INSTANCE",
        "_RESULT_CACHE_FILE",
        "_RERANKER_MODEL"
      ],
      "summary": "Current model/result cache lives under ~/.cache/python-setup/semantic; model is chosen by PYTHON_SETUP_LINT_RERANKER_MODEL defaulting to jina-reranker-v2-base-multilingual."
    },
    {
      "file": "src/python_setup_lint/checkers/_semantic.py",
      "lines": "93-122",
      "anchors": [
        "_load_reranker",
        "CrossEncoder"
      ],
      "summary": "Lazy singleton loader imports sentence_transformers and constructs CrossEncoder, disabling the reranker on import/model-load failure."
    },
    {
      "file": "src/python_setup_lint/checkers/_semantic.py",
      "lines": "125-189",
      "anchors": [
        "semantic_check_if_meaningful",
        "cache_key",
        "reranker.predict"
      ],
      "summary": "Scoring entry point: SHA-256 cache key over text/rule/context/comment/model, pair prediction, accept when score >= 0.5, persist each new result."
    },
    {
      "file": "src/python_setup_lint/checkers/_base.py",
      "lines": "142-158",
      "anchors": [
        "check_if_meaningful",
        "PYTHON_SETUP_LINT_SEMANTIC",
        "_semantic_check"
      ],
      "summary": "Semantic pipeline is gated by PYTHON_SETUP_LINT_SEMANTIC (default on); None falls back to the heuristic checker."
    },
    {
      "file": "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py",
      "lines": "152-158",
      "anchors": [
        "check_if_meaningful",
        "add_message"
      ],
      "summary": "Trailing-reason path calls check_if_meaningful and emits unjustified-suppression when it rejects the comment."
    },
    {
      "file": "pyproject.toml",
      "lines": "28-31",
      "anchors": [
        "semantic",
        "sentence-transformers>=3.0.0"
      ],
      "summary": "The optional semantic extra currently ships sentence-transformers only; model replacement affects packaging."
    },
    {
      "file": "pyproject.toml",
      "lines": "49-49",
      "anchors": [
        "addopts"
      ],
      "summary": "Default pytest selection excludes slow tests, which matters for model-download/cache test strategy."
    },
    {
      "file": "docs/semantic-justification.md",
      "lines": "5-14",
      "anchors": [
        "Overview",
        "Cross-encoder reranker",
        "Heuristic fallback"
      ],
      "summary": "Documented architecture is reranker-first with heuristic fallback and a 0.5 acceptance threshold."
    },
    {
      "file": "docs/semantic-justification.md",
      "lines": "34-45",
      "anchors": [
        "Model Cache",
        "Result Cache",
        "_RESULT_CACHE",
        "results.json"
      ],
      "summary": "Docs specify model downloads and results.json in ~/.cache/python-setup/semantic, plus the in-memory cache keyed by SHA-256."
    },
    {
      "file": "docs/semantic-justification.md",
      "lines": "56-62",
      "anchors": [
        "Test Strategy",
        "Research Status"
      ],
      "summary": "Test strategy distinguishes slow network tests from cache-hit tests, and research status explicitly allows model/threshold/pipeline changes."
    },
    {
      "file": ".gitignore",
      "lines": "243-244",
      "anchors": [
        "NLP semantic model cache",
        ".cache/python-setup/semantic/"
      ],
      "summary": "Current semantic cache is explicitly gitignored, so 'git-stored cache' is a new design decision requiring a new location and cleanup policy."
    },
    {
      "file": "tests/checkers/test_semantic_check.py",
      "lines": "1-7",
      "anchors": [
        "too-many-lines",
        "semantic_check_if_meaningful"
      ],
      "summary": "A 506-line semantic test module disables too-many-lines, already over the CodingRules 500-line C0302 limit; prime debloat target."
    },
    {
      "file": "tests/checkers/test_semantic_check.py",
      "lines": "159-257",
      "anchors": [
        "TestBrushOffPatterns",
        "TestMeaningfulPatterns"
      ],
      "summary": "Heuristic brush-off/meaningful pattern tests overlap with the separate threshold test, indicating redundant coverage."
    },
    {
      "file": "tests/checkers/test_semantic_check.py",
      "lines": "263-424",
      "anchors": [
        "TestSemanticCheck",
        "TestRerankerPairs"
      ],
      "summary": "Reranker-specific tests encode the current cross-encoder contract and will need rewriting or retirement with the model swap."
    },
    {
      "file": "tests/checkers/test_semantic_threshold.py",
      "lines": "19-25",
      "anchors": [
        "TestSemanticThreshold"
      ],
      "summary": "Threshold test exercises check_if_meaningful with the semantic pipeline disabled, duplicating heuristic coverage in test_semantic_check."
    },
    {
      "file": "AGENTS.md",
      "lines": "79-85",
      "anchors": [
        "Semantic justification pipeline",
        "PYTHON_SETUP_LINT_RERANKER_MODEL"
      ],
      "summary": "Agent context documents the cross-encoder pipeline and env var that the modernization must update."
    },
    {
      "file": "AGENTS.md",
      "lines": "87-93",
      "anchors": [
        "Testing Strategy"
      ],
      "summary": "Defines the unit/integration/lint gates, including the fit-for-purpose integration test over all 13 tools."
    },
    {
      "file": "AGENTS.md",
      "lines": "121-139",
      "anchors": [
        "Pre-commit hooks"
      ],
      "summary": "Full lint pipeline runs on commit and fails on NEW violations versus the baseline; repo-wide refactors are gated by this."
    },
    {
      "file": "CodingRules.md",
      "lines": "90-107",
      "anchors": [
        "Simplification"
      ],
      "summary": "Simplification rules (remove redundant wrappers, duplicated logic, over-engineering, redundant checks/fallbacks) are the debloat mandate."
    },
    {
      "file": "CodingRules.md",
      "lines": "139-159",
      "anchors": [
        "Complexity Rules (R0912 / R0915 / C0302) — enforced, not noise"
      ],
      "summary": "Complexity thresholds are enforced: <=16 branches, <=65 statements, <=500 lines/module; over-limit modules must be split, not baselined."
    },
    {
      "file": "CodingRules.md",
      "lines": "230-306",
      "anchors": [
        "Tests",
        "Test Code Quality",
        "Isolation"
      ],
      "summary": "Test rules define metrics, mocking at boundaries, categories, naming, isolation, fixture scope, and conftest scope used to judge test debloat."
    },
    {
      "file": "lint.baseline",
      "lines": "1-1",
      "anchors": [
        "[]"
      ],
      "summary": "The lint baseline is empty, so the repo currently tolerates zero pre-existing violations; any regression fails the self-lint gate."
    }
  ]
}

## Output

Yield a structured JSON object matching this schema:
- setup (array of string, required): Minimal setup shell commands (at most 1-3) executed to prepare a fresh worktree, e.g. ['poetry install'] or ['bun install']. Empty array [] if standard checkout requires no setup.
- gates (array of object, required): Repository quality gates (compile, typecheck, lint, fast tests) defined by the project. If any gate fails on clean checkout, record it as is — the engine records baseline status.
  - id (string, required): Gate identifier (e.g. 'typecheck', 'lint', 'test', 'build')
  - command (string, required): Shell command to run for this gate, e.g. 'ruff check .', 'pytest', 'tsc --noEmit'
- testRunner (object, required): Project test runner configuration for automated red/green checking and JUnit XML reporting
  - command (string, required): Base test runner shell command, e.g. 'pytest', 'cargo test', 'bun test', 'npm test'
  - selectorArgs (array of string, optional): Arguments/flags to pass test selectors to the runner. E.g. ['-k'] for pytest, ['-t'] for jest, or [] if selectors are positional arguments.
  - junitArg (string, optional): Flag/argument template to output JUnit XML report, with '{path}' or '{{path}}' placeholder for the file path. E.g. '--junitxml={path}' for pytest, '--reporter=junit --output={path}', or '' if unsupported.
- notes (array of string, optional): Optional notes or operator actions (e.g. advising to exclude the orchestration folder from project linters)
