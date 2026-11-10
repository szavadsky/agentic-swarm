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
  "slug": "third-party-assumption-tests",
  "kind": "test-assumptions",
  "title": "Pin astroid/pylint/beartype contracts",
  "assignment": "Create tests/assumptions/__init__.py + 3 modules (test_astroid_contracts.py, test_pylint_contracts.py, test_beartype_contracts.py) with distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts, pytestmark no_external_api, tests named test_<api>_given_<condition>_then_<expected> asserting OBSERVED behavior at pinned versions. astroid: Module.stream().read() bytes|str-tolerant (product decodes-if-bytes); doc_node Const/JoinedStr when docstring present else None for module/class/function; nodes_of_class(tuple) returns union in document order; Const/JoinedStr expose int fromlineno/end_lineno/col_offset/end_col_offset (assert on sample literal). pylint (third-party side): PyLinter.register_checker lifecycle incl open()/close() order (record observed); CheckerTestCase/UnittestLinter capture into release_messages (assert observed MessageTest shape); MessageDefinitionTuple leading fields (msgid,symbol,description) + record full arity. beartype: decorate fn with TYPE_CHECKING-only forward-ref, assert OBSERVED outcome (call-time vs import-time vs checker-only), record in item report for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole counts owner). Acceptance: `uv run pytest tests/assumptions -q` all pass, one test per contract.",
  "outlineRef": "third-party-assumption-tests",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Third-party contracts pinned",
    "M2: Assumption failures diagnose at the source"
  ],
  "citations": [
    "pyproject.toml:10-16",
    "pyproject.toml:48-55",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
    "CodingRules.md:230-306"
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
