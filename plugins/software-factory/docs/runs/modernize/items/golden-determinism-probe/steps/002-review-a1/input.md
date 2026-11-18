# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

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

## Engine Checks


## Code Diff

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
