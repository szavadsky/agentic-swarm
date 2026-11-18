# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.

## Assignment
{
  "slug": "golden-determinism-probe",
  "kind": "fact-finder",
  "title": "Probe capture determinism on temp copies",
  "assignment": "Resolve U3 before the snapshot story. Read-only on repo (no committed files); output is the item findings report consumed by golden-findings-snapshot. Steps: (1) Read tests/integration.py _copy_sample/_init_git/_make_config (rumdl override side-effect), src/python_setup_lint/runner/baseline.py _violation_sort_key/_relativize_file/_capture_one, and tests/data/minimal_sample_project layout. (2) On TWO fresh temp copies (copy_sample + git-init + _make_config semantics, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice with baseline=<tmp>/capture.json overwrite; diff raw captures field-by-field (tool,file,line,col,rule,msg + ordering, absolute paths, timestamps). (3) Report: unstable fields list (ordering, absolutes, churn e.g. duplicate-code/detect-secrets/pyright/mypy), verdict (test-side normalization SUFFICIENT vs bounded src fix NEEDED with exact file/scope), and the normalization spec the snapshot implements (drop msg, relativize vs project, strip ./, backslash->/, as_posix, assert non-absolute, None-safe sort). Guards: temp copies ONLY — never bare `uv run lint` on the repo (ruff-format write hazard); never write tests/data or src. Kind corrected from plan test-assumptions to fact-finder per contract (report-only, no permanent tests).",
  "outlineRef": "golden-determinism-probe",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Golden snapshot pins current behavior",
    "M1: Deterministic regeneration"
  ],
  "citations": [
    "tests/integration.py:36-102",
    "src/python_setup_lint/runner/baseline.py:48-59",
    "src/python_setup_lint/runner/baseline.py:116-197",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "pyproject.toml:49"
  ]
}

## Task Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.


## Context & Citations
[
  "tests/integration.py:36-102",
  "src/python_setup_lint/runner/baseline.py:48-59",
  "src/python_setup_lint/runner/baseline.py:116-197",
  "src/python_setup_lint/checkers/_base.py:142-158",
  "pyproject.toml:49"
]

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
