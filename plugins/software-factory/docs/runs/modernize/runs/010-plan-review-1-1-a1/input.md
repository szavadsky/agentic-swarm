# Step: Plan Review

## Goal
Conduct adversarial review of the architect's proposed plan, critiquing milestone scoping, interface contracts, Gherkin scenarios, risk coverage, and dependency structure.

## Rules
- SKEPTICAL REVIEW: scrutinize the plan against project intent and real codebase constraints.
- Scrutiny checklist (numeric bounds come from the `{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "maxInfraRetriesExpensive": 1,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "hydrationBytes": 40000,
  "contextPackBytes": 40000,
  "timeoutNudgeSec": 300,
  "minFreeDiskMb": 2048
}` section; do not invent numbers):
  - Plan bounds: milestone/item counts within limits, acyclic dependencies, unique slugs.
  - Scenario completeness: are scenarios falsifiable, concrete, and comprehensive?
  - Contract clarity: do directional interfaces establish clear caller/callee contracts?
  - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
  - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
- Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

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

## Plan
{
  "iteration": 1,
  "milestones": [
    {
      "id": "M1",
      "title": "Golden lint-findings safety net (behavior-preservation contract)",
      "scenarios": [
        "Scenario: Golden snapshot pins current behavior\n  Given a fresh git-initialised copy of tests/data/minimal_sample_project and PYTHON_SETUP_LINT_SEMANTIC=0\n  When run_lint runs with the shipped configs and captures its baseline into a temp file\n  Then the findings reduced to {tool, file, line, col, rule} equal tests/data/golden/minimal_sample_project_findings.json exactly",
        "Scenario: Behavior drift is reported precisely\n  Given a change that adds or removes any finding on the sample project\n  When `uv run pytest tests/integration.py -v` runs\n  Then the golden assertion fails and lists every added and every removed record",
        "Scenario: Deterministic regeneration\n  Given PYTHON_SETUP_UPDATE_GOLDEN=1\n  When the golden test runs twice in a row\n  Then both runs write a byte-identical golden file, sorted by (tool, file, line, col, rule), with project-relative POSIX paths and no messages, timestamps or absolute paths",
        "Scenario: Planted-rule coverage preserved\n  Given the golden snapshot\n  When it is checked against the planted rule list\n  Then every planted rule symbol appears, the 'pre-existing' brush-off yields unjustified-suppression, and the carry-from-external justification yields no unjustified-suppression"
      ],
      "directionalInterfaces": [
        "tests/data/golden/minimal_sample_project_findings.json: a sorted JSON array of {tool: str, file: str, line: int, col: int, rule: str}. It lives outside the sample project dir, so it is never copied into the project or linted.",
        "run_lint(config=RunnerConfig(cwd=project, config_paths=shipped_config_paths()), path='.', baseline=str(tmp/'capture.json'), overwrite_baseline=True) -> int. Captured records use the runner.baseline._capture_baseline schema with `msg` removed.",
        "collect_findings(project: Path, tmp: Path) -> list[Finding]; assert_matches_golden(findings: list[Finding], golden: Path) -> None. When PYTHON_SETUP_UPDATE_GOLDEN=1 it rewrites the golden file instead of asserting."
      ]
    },
    {
      "id": "M2",
      "title": "Test infrastructure and third-party assumptions baseline (test infra/assumptions first)",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given helpers for copying the sample project, initialising git and resolving shipped config paths\n  When tests/ is searched\n  Then each helper is defined exactly once and imported by tests/integration.py, tests/conftest.py and runner test helpers",
        "Scenario: Integration gate module within limits\n  Given the extracted helpers\n  When `uv run lint` and `uv run pytest tests/integration.py -v` run\n  Then tests/integration.py has <= 500 lines and no too-many-lines suppression, test names are unchanged, all tests pass and the golden snapshot is unchanged",
        "Scenario: Third-party contracts pinned\n  Given the astroid, pylint and beartype behaviors that the custom checkers rely on\n  When `uv run pytest tests/assumptions -q` runs\n  Then each contract has one passing TestImportedPackageBehavior test named test_<api>_given_<condition>_then_<expected> and marked no_external_api",
        "Scenario: Broken assumption is diagnosed at the source\n  Given a dependency upgrade that changes e.g. astroid Module.stream() or doc_node semantics\n  When the unit suite runs\n  Then the failing test is the assumption test that names that contract, not an unrelated checker test"
      ],
      "directionalInterfaces": [
        "tests/_project_helpers.py: copy_sample_project(tmp_path: Path) -> Path; git_init(project: Path) -> None; shipped_config_paths() -> dict[str, Path]. Each is defined once; tests/conftest.py and tests/runner/_autofix_helpers.py import them instead of redefining.",
        "tests/assumptions/{test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contracts.py}: class TestImportedPackageBehavior; pytestmark = pytest.mark.no_external_api."
      ]
    },
    {
      "id": "M3",
      "title": "Modernization debt inventory and subsystem epic decomposition",
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the coding-rules audit completes\n  Then every src/ and scripts/ module is listed with concrete violations (file:line evidence, CodingRules section, debt category adjacent|impacting|blocking, estimated LoC delta) and an owning subsystem (runner | checkers | setup-testing-scripts)",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden snapshot\n  When the test-debloat audit completes\n  Then each test module has a keep|merge|rewrite|remove recommendation that names the behavior it protects and the surviving test that covers it, and every test that asserts this repository passes lint is listed for removal",
        "Scenario: Subsystem epics decomposable without overlap\n  Given both audit reports\n  When iteration 2 is replanned\n  Then the runner, checkers and setup-testing-scripts epics have disjoint file ownership that excludes files owned by semantic-decision-model"
      ],
      "directionalInterfaces": [
        "Coding-rules audit report rows: {module, CodingRules section, evidence file:line, category, est. LoC delta, owner subsystem, proposed fix}",
        "Test audit report rows: {test module, behaviors protected, duplicate-of, recommendation keep|merge|rewrite|remove, reason, owner subsystem}"
      ],
      "replanAfter": true
    }
  ],
  "uncertainties": [
    {
      "id": "U1",
      "description": "Which decision model meets all the constraints is unknown. The constraints are: CPU-friendly, a license compatible with an MIT tool that downloads weights at runtime, Python 3.14 CPU wheels for its runtime, no unpinned remote code, and acceptable accuracy on real justifications. fastino/GLiDE-0.4B uses a 'fastino-community' license, ships 0.81 GB of bf16 weights, needs its bundled `glide` package, and was tested on Python 3.12 with torch 2.14 and transformers 5.17. The smaller candidates need custom inference code and their licenses vary (e.g. crivo is cc-by-nc-4.0, tasksource-decider-nano is apache-2.0, bekko has ONNX exports).",
      "spikeOutlines": [
        "semantic-decision-model epic, fact-finder: a candidate matrix (license, params/download size, runtime stack, Python 3.14 wheel availability, custom-code requirement, pinnable revision) covering GLiDE-0.4B and smaller Decision-Index models",
        "semantic-decision-model epic, poc: CPU-only cold-load time, warm per-decision latency and accuracy on a labeled corpus built from this repo's real suppression justifications plus the brush-off/meaningful tables in today's tests; pick the smallest model, prompt and threshold that meet the bar",
        "semantic-decision-model epic, test-assumptions: install the chosen runtime through the `semantic` extra on Python 3.14 and pin its loader/inference API behavior in tests/assumptions/"
      ]
    },
    {
      "id": "U2",
      "description": "How a git-stored cache behaves under concurrency and cleanup when it is written from inside pylint is unknown. Open questions: pylint `jobs` under the runner and pre-commit, when checker open()/close() hooks run, partial-path and staged-file runs, and three pylint invocations (pylint, pylint-pyi, pylint tests) sharing one project.",
      "spikeOutlines": [
        "semantic-decision-model epic, test-assumptions: pin pylint 4.x invocation and hook semantics (process count, close() timing, partial runs) that the cache's lock, merge and mark-and-sweep design relies on"
      ]
    },
    {
      "id": "U3",
      "description": "The golden snapshot must be deterministic across runs and machines. Possible nondeterminism: record ordering from pylint duplicate-code, detect-secrets results over git ls-files, pyright/mypy message churn, and absolute-path leakage.",
      "spikeOutlines": [
        "Inside golden-findings-snapshot: run the capture twice, diff the results, and normalize or exclude any unstable field, with a documented reason"
      ]
    },
    {
      "id": "U4",
      "description": "The size and shape of the coding-rules debt in src/ and of the redundant or lint-testing tests in tests/ (~28.6k LOC) are unknown, so the subsystem epics cannot be scoped responsibly yet.",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder)",
        "test-debloat-audit (fact-finder)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "golden-findings-snapshot",
      "kind": "story",
      "title": "Golden snapshot of normalized lint findings for the sample project",
      "description": "Make the integration gate pin exact lint behavior.\n\n- **Capture.** Run the real pipeline on a git-initialised temp copy of tests/data/minimal_sample_project with shipped configs and PYTHON_SETUP_LINT_SEMANTIC=0 (monkeypatched). Capture records with run_lint(..., baseline=<tmp>/capture.json, overwrite_baseline=True).\n- **Normalize.** Reduce records to {tool, file, line, col, rule}: drop `msg`, use project-relative POSIX paths, sort by (tool, file, line, col, rule).\n- **Compare.** Compare against the committed tests/data/golden/minimal_sample_project_findings.json. Keep it outside the sample dir so it is never linted. On mismatch, the failure lists added and removed records.\n- **Regenerate.** PYTHON_SETUP_UPDATE_GOLDEN=1 rewrites the file deterministically.\n- **Reuse the existing run.** Prefer extending the pipeline run already in TestMinimalSampleProject::test_setup_new_and_lint over adding a second full run.\n- **Replace the substring loop.** Swap the per-rule substring loop over violations.txt for a coverage check derived from the golden. Delete violations.txt if nothing else references it.\n- **Keep key assertions.** The brush-off 'pre-existing' and carry-from-external assertions stay, expressed as golden records.\n- **Verify determinism.** Run the capture twice (U3).\n\nNo src/ changes. Acceptance: `uv run pytest tests/integration.py -v`, `uv run pytest -q` and `uv run lint` pass with an empty lint.baseline.",
      "milestoneId": "M1"
    },
    {
      "slug": "third-party-assumption-tests",
      "kind": "test-assumptions",
      "title": "Pin astroid/pylint/beartype contracts relied on by checkers",
      "description": "Create tests/assumptions/ (with __init__.py). Add TestImportedPackageBehavior tests for each third-party behavior the checkers depend on:\n\n- **astroid:** Module.stream() yields bytes; doc_node is set for module, class and function docstrings; nodes_of_class accepts a tuple of classes; Const and JoinedStr expose fromlineno/end_lineno/col_offset/end_col_offset, which the string-literal span logic uses.\n- **pylint:** CheckerTestCase/UnittestLinter capture add_message output; plugins register through `register(linter)`; MessageDefinitionTuple has the expected shape.\n- **beartype:** decorating a function whose annotation is a TYPE_CHECKING-only forward reference fails at call time. This is the stated rationale behind the repeated missing-beartype suppressions on register().\n\nNaming and markers: test_<api>_given_<condition>_then_<expected>, pytestmark no_external_api.\n\nNo src/ changes. If an assumption turns out false, keep the test asserting the observed behavior and record the discrepancy in the item report for the M3 audits.",
      "milestoneId": "M2"
    },
    {
      "slug": "consolidate-integration-helpers",
      "kind": "story",
      "title": "Single-source shared test helpers; bring tests/integration.py under 500 lines",
      "description": "Extract the helper functions in tests/integration.py (_copy_sample, _init_git, _shipped_config_paths, _make_config and any violations.txt leftovers) into tests/_project_helpers.py. Dedupe them with tests/conftest.py::shipped_config_paths and tests/runner/_autofix_helpers.py::_git_init so each helper is defined once and imported everywhere.\n\nConstraints:\n- tests/integration.py stays the gate entry point at the same path, with unchanged test class and function names.\n- Shrink it to <= 500 lines and remove its too-many-lines suppression.\n- No behavior change: the golden snapshot stays unchanged and test counts stay the same.\n- If any test count in AGENTS.md changes, update it.\n\nAcceptance: `uv run pytest tests/integration.py -v`, `uv run pytest -q` and `uv run lint` pass.",
      "milestoneId": "M2",
      "deps": [
        "golden-findings-snapshot"
      ]
    },
    {
      "slug": "coding-rules-audit",
      "kind": "fact-finder",
      "title": "Inventory CodingRules.md/AGENTS.md violations across src/ and scripts/",
      "description": "Read-only audit of src/python_setup_lint/** and scripts/** against CodingRules.md and AGENTS.md. Exclude files owned by the semantic-decision-model epic.\n\nWhat to inventory:\n- .pyi completeness and fidelity, and private symbols in stubs.\n- @beartype coverage, and structural suppressions repeated across checkers (missing-beartype on register(), type: ignore[misc] on every mixin-based checker class, ty/pyright ignores).\n- Trivial wrappers and duplicated logic, e.g. module stream read/decode copied across checkers, or `make_tc` duplicating testing._make_tc.\n- Redundant fallbacks for hard-declared deps, e.g. the astroid 3.x docstring path while astroid>=4.0.4 is declared.\n- Legacy/compat stubs, e.g. baseline._FALLBACK_TOOLS, peek_fallback_tools, the _compare_sorted re-export.\n- Over-long rationale comments, e.g. the 500+ char comment ending in `# pylint: disable=unjustified-suppression` in runner/dispatch.py.\n- Modules near the 500-line limit and functions near the R0912/R0915 thresholds.\n- structlog usage and the error-handling rules.\n\nOutput: a table of {module, rule section, evidence file:line, category adjacent|impacting|blocking, est. LoC delta, owner subsystem runner|checkers|setup-testing-scripts, proposed fix}, plus a proposed disjoint file ownership for the iteration-2 subsystem epics.",
      "milestoneId": "M3",
      "replanAfter": true
    },
    {
      "slug": "test-debloat-audit",
      "kind": "fact-finder",
      "title": "Inventory redundant, lint-testing and rule-violating tests",
      "description": "Read-only audit of tests/**. Exclude the semantic tests owned by semantic-decision-model.\n\nFor each test module, record:\n- the behaviors it protects;\n- duplicates of other tests, i.e. the same behavior asserted elsewhere, including coverage already provided by the golden snapshot;\n- violations of the CodingRules Tests section: mocking first-party code, naming, missing markers, shared fixtures inside test files, list[Any] pytest.param tables in tests/checkers/_factories.py (~1400 lines), cases far from their tests;\n- tests that 'test linting' (test_self_lint_clean.py, source-scanning guards in test_runner_private_imports.py, config-consistency checks that re-lint the repo);\n- slow/benchmark tests;\n- module names that encode historical task IDs (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*).\n\nOutput: rows of {test module, behaviors protected, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner subsystem}, with an estimated LoC reduction per subsystem.",
      "milestoneId": "M3",
      "replanAfter": true
    }
  ],
  "assumptions": [
    {
      "assumption": "'Material lint/check behavior' means four things:\n- the findings {tool, file, line, col, rule} that each of the 13 tools and each custom checker produces, pinned by the golden snapshot and the checker unit tests;\n- CLI flags and exit codes;\n- baseline and autofix semantics;\n- shipped configs and tool scopes.\n\nThe replaced reranker's individual accept/reject decisions are not material. The heuristic gate's outcomes (rejecting empty, boilerplate, brush-off and rule-echo justifications) are material.",
      "why": "The intent replaces the model and also demands behavior preservation. Drawing this boundary makes 'preserve' mechanically testable.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "The git-stored decision cache belongs to the repository being linted (python-setup itself and consumer projects alike), not to the installed package. Model weights are never committed; only decisions are.",
      "why": "Decisions depend on project content and must be reproducible in that project's CI without the model. Weights run from roughly 0.03 to 0.8 GB and carry their own licenses.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Dev and CI environments do not install the `semantic` extra; sentence-transformers is absent from .venv today. All gates therefore run the heuristic path plus cache hits, and real-model tests are marked slow + with_real_api.",
      "why": "Matches the current .venv contents and keeps the gates offline, fast and deterministic."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py` and `uv run lint` are gate contracts: their paths and commands do not change during the modernization.",
      "why": "The infra gates and AGENTS.md reference them, so renaming any of them would silently break gating."
    },
    {
      "assumption": "'Never test linting' means pytest must not assert that this repository is lint-clean or re-run lint tools on it. The `uv run lint` gate and pre-commit enforce that. Tests exercise checker and runner logic on synthetic inputs and on the sample project.",
      "why": "This removes slow, duplicate coverage such as test_self_lint_clean.py and keeps tests focused on behavior.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Only the semantic-decision-model epic starts now. The runner, checkers and setup-testing-scripts epics are spawned at the iteration-2 replan, informed by the M3 audits.",
      "why": "Debloat must follow the safety net and the assumption tests ('test infra/assumptions first'). Starting the subsystem epics now would mean concurrent edits to shared test infra and conflicting merges."
    },
    {
      "assumption": "At least one model among GLiDE-0.4B and the smaller Decision-Index models has a compatible license, Python 3.14 CPU wheels and a pinnable revision. If none qualifies, the semantic epic escalates instead of shipping a non-compliant model.",
      "why": "GLiDE-0.4B uses a custom community license and was tested on Python 3.12. Several smaller candidates are non-commercial or require remote code.",
      "disposition": "verify via semantic-decision-model spikes"
    }
  ],
  "epics": [
    {
      "slug": "semantic-decision-model",
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind the suppression-justification check with a CPU-friendly small decision model plus a git-stored decision cache that cleans itself up. Preserve every material lint/check behavior. This is a child epic of the `modernize` saga.\n\n## Scope (files owned by this epic)\n- src/python_setup_lint/checkers/_semantic.py and .pyi, plus any new private modules and stubs for the decision backend and cache (e.g. checkers/_decision_backend.py, checkers/_decision_cache.py). Every new module needs a .pyi, @beartype on public functions, structlog kwargs logging, and must respect tach boundaries.\n- check_if_meaningful in checkers/_base.py and .pyi. Its call sites in conformance/suppression_justification_checker.py and conformance/bare_except_comment_checker.py change only where the call contract changes.\n- _OPTIONAL_IMPORT_PATTERNS in conformance/no_try_import_checker.py: replace sentence_transformers with the new runtime's modules.\n- pyproject.toml [project.optional-dependencies].semantic and uv.lock; the semantic entries in .gitignore.\n- Docs: docs/semantic-justification.md, the check_if_meaningful bullet in docs/custom-checks.md, the semantic section of docs/troubleshooting.md, the 'Semantic justification pipeline' section of AGENTS.md (which today wrongly calls W9704 'the semantic checker'), and a CHANGELOG.md entry.\n- Tests: tests/checkers/test_semantic_check.py, tests/checkers/test_semantic_threshold.py, TestSuppressionRerankerPipeline in tests/checkers/test_suppression_justification_checker.py, new decision/cache test modules, tests/checkers/conftest.py, and new runtime-assumption modules under tests/assumptions/.\n\nOut of scope:\n- Refactoring other checkers or runner modules.\n- tests/integration.py, tests/conftest.py and tests/data/** (owned by the root safety-net milestones and the later subsystem epics).\n- Any unavoidable runner touch point (e.g. passing the cache path to pylint subprocesses) must stay minimal and be recorded in an ADR.\n\n## Requirements\n1. Spikes come before design commitments.\n   - (a) fact-finder: build a candidate matrix for fastino/GLiDE-0.4B and smaller models from the Jev Decision Index board (e.g. tasksource/tasksource-decider-nano, hotchpotch/bekko-system-one-v0-17m/-68m, knowledgator/gliclass-v4-edge, fastino/GLiNER2.5-Decide). Cover:\n     - license: exclude non-commercial; GLiDE is 'fastino-community';\n     - parameter count and download size;\n     - runtime stack (torch+transformers vs onnxruntime+tokenizers), with Python 3.14 CPU wheels on Linux, macOS and Windows;\n     - custom inference code: it must be vendored or pinned to a revision; never unpinned trust_remote_code;\n     - offline behavior.\n   - (b) poc, CPU only: measure cold-load time, warm per-decision latency and accuracy on a labeled corpus. Build the corpus from this repository's real suppression justifications plus the brush-off/meaningful tables in today's tests. Choose the smallest model, prompt (e.g. a yes/no question over {justification, rule, context}) and threshold that meet the accuracy bar, and record the measurements and the choice in an ADR.\n   - (c) test-assumptions: pin how pylint 4.x is invoked by the runner and by pre-commit (jobs, process per tool, when checker open()/close() run, partial-path and staged-file runs). The cache's lock, merge and mark-and-sweep design depends on this.\n2. Decision contract:\n   - Keep check_if_meaningful(text, *, rule, code_context, comment) -> bool.\n   - Keep PYTHON_SETUP_LINT_SEMANTIC: default '1'; '0' means heuristic only, and the semantic module is never imported.\n   - The heuristic runs first as a hard gate. Empty, short, boilerplate, brush-off and rule-echo justifications are rejected without consulting the model. Only text the heuristic accepts goes to the cache, then to the model.\n   - semantic_check_if_meaningful keeps returning bool | None. None means the backend is unavailable and the heuristic result stands.\n   - The model sits behind a small DecisionBackend Protocol (decide(justification, rule, context) -> probability) so tests can inject a fake at the model boundary.\n3. Packaging and configuration:\n   - The `semantic` extra ships the chosen runtime instead of sentence-transformers.\n   - Without the extra, or on download, load or inference failure, results equal the heuristic plus cache hits. Emit one warning and avoid a retry storm (keep a sentinel).\n   - Weights stay in the user's model cache, never in git.\n   - PYTHON_SETUP_LINT_DECISION_MODEL selects the model id and pinned revision. PYTHON_SETUP_LINT_RERANKER_MODEL is deprecated: log a warning and ignore it.\n4. Git-stored decision cache, replacing ~/.cache/python-setup/semantic/results.json:\n   - Location: a committed file at the linted project's root, e.g. .python-setup-decisions.json next to lint.baseline.\n   - Format: deterministic, sorted, one entry per line. Entries are human-readable: {justification (normalized), rule, model@revision+prompt-version, decision, files}.\n   - Keys must not trip detect-secrets (no raw high-entropy hex), and the file must pass all 13 tools.\n   - Decision inputs are limited so that unrelated edits to a line do not invalidate its entry.\n   - Cache hits need no model, so lint results are identical on machines with and without the extra.\n   - Writes are lock-protected merge-on-write followed by an atomic replace.\n   - Cleanup is mark-and-sweep, scoped to the files linted in the run. Partial runs never delete entries for files they did not lint. Entries for deleted files and for other model/prompt versions are dropped.\n   - Tests never write to the repository's own cache (the path is isolated by a fixture).\n5. Pass the actual suppressed rule code(s) from disable=/noqa:/ignore[...] instead of the checker's own symbol ('unjustified-suppression'). If this changes any heuristic outcome on the sample project, regenerate tests/data/golden/minimal_sample_project_findings.json with PYTHON_SETUP_UPDATE_GOLDEN=1 in the same change, review the diff, and record it in CHANGELOG. Otherwise the golden stays unchanged.\n6. Tests:\n   - Merge TestBrushOffPatterns, TestMeaningfulPatterns and TestSemanticThreshold into one parametrized heuristic table.\n   - Test the backend through the fake Protocol. Do not patch module globals or builtins.__import__, and do not import private symbols with type: ignore.\n   - Add cache round-trip, cleanup and concurrency tests on tmp paths, plus a hypothesis round-trip for the cache format.\n   - Add exactly one slow + with_real_api end-to-end test that uses the real model.\n   - Delete vacuous assertions such as `result is None or isinstance(result, bool)`.\n   - Keep every module under 500 lines without too-many-lines suppressions.\n   - Never test linting.\n7. Update the docs and agent context listed in Scope to the new design. CHANGELOG covers only user-visible changes: the extra's new contents, the new env var, the deprecated env var and the new cache file.\n\n## Acceptance (Gherkin)\n- Scenario: Heuristic path unchanged. Given PYTHON_SETUP_LINT_SEMANTIC=0, When the sample project is linted, Then the findings equal tests/data/golden/minimal_sample_project_findings.json.\n- Scenario: Cache works without the model. Given the semantic extra is not installed and the project cache holds a false decision for a justification/rule pair, When lint runs, Then W9704 is emitted for that suppression and no model is loaded.\n- Scenario: Brush-off never reaches the model. Given the justification 'pre-existing' and an available fake backend, When check_if_meaningful runs, Then it returns False and the backend is not called.\n- Scenario: One call per unique pair. Given a cache miss and an available backend, When lint runs, Then the backend is called exactly once per unique (justification, rule) and the decision is persisted in sorted order.\n- Scenario: Scoped cleanup. Given a suppression comment has been deleted from a.py, When a run lints a.py, Then its cache entry is removed. And When a run lints only b.py, Then the entry is kept.\n- Scenario: No retry storm. Given model loading fails, When lint checks many suppressions in one process, Then loading is attempted once and heuristic results are returned.\n- Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v` and `uv run lint` all pass with an empty lint.baseline."
    }
  ],
  "techDebt": [
    {
      "id": "TD-1",
      "description": "The suppression-justification and bare-except checkers pass their own symbol ('unjustified-suppression' / 'bare-except-comment') as `rule` to check_if_meaningful. As a result, the documented rule-echo heuristic and the semantic model never see the rule that is actually being suppressed.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 5: extract the real suppressed codes and pass them. Any golden diff this causes must be reviewed, regenerated in the same change, and recorded in CHANGELOG."
    },
    {
      "id": "TD-2",
      "description": "Semantic tests mock first-party code: they patch module globals (_RERANKER_UNAVAILABLE, _RESULT_CACHE), patch builtins.__import__, and import private symbols under type: ignore. Several assertions are vacuous (`result is None or isinstance(result, bool)`). This breaks the CodingRules mocking strategy and protects nothing.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 6: inject a fake at the DecisionBackend Protocol boundary and delete the vacuous tests."
    },
    {
      "id": "TD-3",
      "description": "tests/integration.py is 627 lines with a too-many-lines suppression. It duplicates the helpers in tests/conftest.py and tests/runner/_autofix_helpers.py, and it only substring-matches rule names, so dropped, moved or new findings go unnoticed.",
      "category": "impacting",
      "resolution": "M1 golden-findings-snapshot pins the exact findings. M2 consolidate-integration-helpers single-sources the helpers and brings the module to <= 500 lines without the suppression."
    },
    {
      "id": "TD-4",
      "description": "tests/checkers/test_semantic_check.py is 506 lines and suppresses too-many-lines. Its heuristic tables duplicate tests/checkers/test_semantic_threshold.py.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 6: one merged parametrized table, and modules under 500 lines."
    },
    {
      "id": "TD-5",
      "description": "The same structural suppressions repeat across about 15 checkers: missing-beartype on every register(linter), type: ignore[misc] on every SourceRootMixin/FunctionVisitMixin checker class, and copied stream-read/decode blocks. These are design smells, not one-off justifications.",
      "category": "adjacent",
      "resolution": "Inventoried by coding-rules-audit and fixed by the iteration-2 checkers epic (e.g. a BaseChecker-derived source-root base class, a shared source-lines helper, a typed register pattern)."
    },
    {
      "id": "TD-6",
      "description": "Legacy and compat code remains for removed formats and for hard-declared dependencies: baseline._FALLBACK_TOOLS and peek_fallback_tools ('legacy stub: always empty'), the _compare_sorted re-export, and the astroid 3.x docstring fallback even though astroid>=4.0.4 is declared. CodingRules says to remove fallbacks for hard-declared dependencies.",
      "category": "adjacent",
      "resolution": "To be removed by the iteration-2 runner and checkers epics, guarded by the golden snapshot."
    },
    {
      "id": "TD-7",
      "description": "runner/dispatch.py carries a rationale comment of more than 500 characters that ends in `# pylint: disable=unjustified-suppression`, which suppresses the justification checker itself.",
      "category": "adjacent",
      "resolution": "Iteration-2 runner epic: move the rationale to design/0002 (already referenced) and leave a short, justified comment."
    },
    {
      "id": "TD-8",
      "description": "tests/checkers/_factories.py is about 1400 lines. It types around 40 pytest.param tables as list[Any] with copy-pasted justification comments, and keeps cases far from the tests that use them.",
      "category": "adjacent",
      "resolution": "Iteration-2 checkers epic, following test-debloat-audit: type the tables as ParameterSet, move cases next to their tests, and split per checker."
    },
    {
      "id": "TD-9",
      "description": "Several test modules are named after historical task IDs (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*) instead of behavior. Some tests lint this repository: test_self_lint_clean.py and the source-scanning guards in test_runner_private_imports.py.",
      "category": "adjacent",
      "resolution": "Iteration-2 runner and setup epics, following test-debloat-audit: rename modules by behavior and remove lint-the-repo tests, which the `uv run lint` gate already covers."
    },
    {
      "id": "TD-10",
      "description": "ADR locations disagree: CodingRules.md requires design/ (ADR format), but factory ADRs are written to docs/adr.",
      "category": "adjacent",
      "resolution": "At the iteration-2 replan, add a cross-reference (design/README or the AGENTS.md index) so both locations are discoverable. Engine configuration is not changed."
    }
  ],
  "adrs": [
    {
      "id": "ADR-001",
      "title": "Golden findings snapshot as the behavior-preservation contract",
      "context": "The modernization enforces coding rules, debloats code and tests, removes tests and swaps the semantic model, and it must still preserve every material lint/check behavior. lint.baseline is empty. The integration test only checks that each planted rule name appears somewhere in the output, so duplicate findings, moved lines and new false positives all go undetected.",
      "decision": "Commit a normalized snapshot of every finding, {tool, file, line, col, rule}, for tests/data/minimal_sample_project. Store it at tests/data/golden/minimal_sample_project_findings.json, outside the linted project. Produce it through the runner's baseline capture with PYTHON_SETUP_LINT_SEMANTIC=0 and assert it in tests/integration.py. Regenerate it only with PYTHON_SETUP_UPDATE_GOLDEN=1, in the same change as the behavior change, with the diff reviewed. Every modernization item must leave it unchanged unless the item explicitly declares a behavior change.",
      "consequences": "Regression detection across all 13 tools and every custom checker becomes exact and cheap, and golden updates become explicit review points. Message text is not snapshotted, so changes in message wording are not guarded. Tool upgrades via uv.lock may require a reviewed regeneration."
    },
    {
      "id": "ADR-002",
      "title": "Heuristic-gated local decision model for justification checks",
      "context": "_semantic.py misuses a sentence-transformers cross-encoder (jina-reranker-v2) as a quality judge. It scores a self-pair, or a query of the form 'rule: unjustified-suppression | context', against a 0.5 threshold. The dependency is heavy, and because it is not installed in dev/CI the heuristic actually makes every decision today. The intent asks for a CPU-friendly small decision model (GLiDE-0.4B or smaller).",
      "decision": "Keep the check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC. Run the heuristic first as a hard gate; its rejections never reach the model. For text the heuristic accepts, consult the git-stored cache first, then a local decision model behind a DecisionBackend Protocol that returns P(meaningful) for a yes/no question. The model, prompt and threshold are chosen by spike under four constraints: a compatible license, Python 3.14 CPU wheels, a pinned revision, and no unpinned remote code. The model ships through the existing `semantic` extra and is configured with PYTHON_SETUP_LINT_DECISION_MODEL. PYTHON_SETUP_LINT_RERANKER_MODEL is deprecated. When the backend is unavailable it returns None and the heuristic result stands.",
      "consequences": "Brush-off rejections are guaranteed regardless of the model, which can only tighten acceptance. sentence-transformers is dropped. no-try-import's optional patterns must list the new runtime. Real-model coverage moves to one slow + with_real_api test. Users who set the old env var get a deprecation warning, documented in CHANGELOG."
    },
    {
      "id": "ADR-003",
      "title": "Git-stored, self-cleaning decision cache",
      "context": "Results are cached in ~/.cache/python-setup/semantic/results.json. That file is gitignored, per machine and unbounded, and it is keyed by a 64-bit truncated SHA-256 that includes code context. As a result, W9704 outcomes can differ between machines with and without the model, and stale entries are never removed. The intent requires a git-stored cache with cleanup.",
      "decision": "Store decisions in a committed file at the linted project's root, e.g. .python-setup-decisions.json next to lint.baseline.\n\n- **Format:** deterministic, sorted, one entry per line. Each entry is {normalized justification, rule, model@revision+prompt-version, decision, files}, with readable composite keys and no high-entropy hex that detect-secrets would flag.\n- **Stable inputs:** decision inputs are limited so that unrelated edits to a line do not invalidate its entry.\n- **Reads and writes:** reads need no model. Writes are lock-protected merge followed by an atomic replace.\n- **Cleanup:** mark-and-sweep, scoped to the files linted in the run, plus removal of entries for deleted files and for stale model/prompt versions.\n- **Tests:** they isolate the cache path.\n\nModel weights stay in the user's model cache.",
      "consequences": "W9704 decisions become reproducible across machines and in CI without the extra. Decision changes show up as reviewable diffs in PRs, and humans can audit them. Concurrent branches may produce small, line-local merge conflicts. Consumer repos gain one committed file, which the install and setup docs must mention, and the file itself must pass all 13 tools."
    },
    {
      "id": "ADR-004",
      "title": "Progressive saga decomposition with disjoint file ownership",
      "context": "Three workstreams (coding-rules enforcement, code/test debloat, the semantic swap) span about 28.6k LOC across 184 files. Running them in parallel would mean conflicting edits to shared test infra. The intent also requires testing the infrastructure and assumptions before any debloat.",
      "decision": "Iteration 1: the root delivers the golden safety net, test-infra consolidation and third-party assumption tests, plus read-only audits, and spawns the semantic-decision-model epic now, since its files are disjoint. Iteration 2 (replan): spawn subsystem epics for runner, checkers and setup-testing-scripts. Each epic does both coding-rules enforcement and test debloat for its own subsystem, with disjoint ownership derived from the audits and with semantic-owned files excluded. Policy: pytest never asserts that this repository passes lint; the `uv run lint` gate does that.",
      "consequences": "Shared test infra is never edited concurrently, and debloat always runs behind the golden snapshot and the assumption tests. Changes to source and its tests stay together within each subsystem. The subsystem epics start one iteration later, but they are scoped from evidence rather than guesswork."
    }
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


## Context
citations:
  - file: src/python_setup_lint/checkers/_semantic.py
    lines: 1-12
    anchors:
      - Cross-encoder reranking
      - sentence-transformers
    summary: "Module purpose: single-stage NLP justification pipeline built on a
      cross-encoder reranker, lazily loaded with heuristic fallback on failure."
  - file: src/python_setup_lint/checkers/_semantic.py
    lines: 37-52
    anchors:
      - _CACHE_DIR
      - _RERANKER_INSTANCE
      - _RESULT_CACHE_FILE
      - _RERANKER_MODEL
    summary: Current model/result cache lives under ~/.cache/python-setup/semantic;
      model is chosen by PYTHON_SETUP_LINT_RERANKER_MODEL defaulting to
      jina-reranker-v2-base-multilingual.
  - file: src/python_setup_lint/checkers/_semantic.py
    lines: 93-122
    anchors:
      - _load_reranker
      - CrossEncoder
    summary: Lazy singleton loader imports sentence_transformers and constructs
      CrossEncoder, disabling the reranker on import/model-load failure.
  - file: src/python_setup_lint/checkers/_semantic.py
    lines: 125-189
    anchors:
      - semantic_check_if_meaningful
      - cache_key
      - reranker.predict
    summary: "Scoring entry point: SHA-256 cache key over
      text/rule/context/comment/model, pair prediction, accept when score >=
      0.5, persist each new result."
  - file: src/python_setup_lint/checkers/_base.py
    lines: 142-158
    anchors:
      - check_if_meaningful
      - PYTHON_SETUP_LINT_SEMANTIC
      - _semantic_check
    summary: Semantic pipeline is gated by PYTHON_SETUP_LINT_SEMANTIC (default on);
      None falls back to the heuristic checker.
  - file: src/python_setup_lint/checkers/conformance/suppression_justification_checker.py
    lines: 152-158
    anchors:
      - check_if_meaningful
      - add_message
    summary: Trailing-reason path calls check_if_meaningful and emits
      unjustified-suppression when it rejects the comment.
  - file: pyproject.toml
    lines: 28-31
    anchors:
      - semantic
      - sentence-transformers>=3.0.0
    summary: The optional semantic extra currently ships sentence-transformers only;
      model replacement affects packaging.
  - file: pyproject.toml
    lines: 49-49
    anchors:
      - addopts
    summary: Default pytest selection excludes slow tests, which matters for
      model-download/cache test strategy.
  - file: docs/semantic-justification.md
    lines: 5-14
    anchors:
      - Overview
      - Cross-encoder reranker
      - Heuristic fallback
    summary: Documented architecture is reranker-first with heuristic fallback and a
      0.5 acceptance threshold.
  - file: docs/semantic-justification.md
    lines: 34-45
    anchors:
      - Model Cache
      - Result Cache
      - _RESULT_CACHE
      - results.json
    summary: Docs specify model downloads and results.json in
      ~/.cache/python-setup/semantic, plus the in-memory cache keyed by SHA-256.
  - file: docs/semantic-justification.md
    lines: 56-62
    anchors:
      - Test Strategy
      - Research Status
    summary: Test strategy distinguishes slow network tests from cache-hit tests,
      and research status explicitly allows model/threshold/pipeline changes.
  - file: .gitignore
    lines: 243-244
    anchors:
      - NLP semantic model cache
      - .cache/python-setup/semantic/
    summary: Current semantic cache is explicitly gitignored, so 'git-stored cache'
      is a new design decision requiring a new location and cleanup policy.
  - file: tests/checkers/test_semantic_check.py
    lines: 1-7
    anchors:
      - too-many-lines
      - semantic_check_if_meaningful
    summary: A 506-line semantic test module disables too-many-lines, already over
      the CodingRules 500-line C0302 limit; prime debloat target.
  - file: tests/checkers/test_semantic_check.py
    lines: 159-257
    anchors:
      - TestBrushOffPatterns
      - TestMeaningfulPatterns
    summary: Heuristic brush-off/meaningful pattern tests overlap with the separate
      threshold test, indicating redundant coverage.
  - file: tests/checkers/test_semantic_check.py
    lines: 263-424
    anchors:
      - TestSemanticCheck
      - TestRerankerPairs
    summary: Reranker-specific tests encode the current cross-encoder contract and
      will need rewriting or retirement with the model swap.
  - file: tests/checkers/test_semantic_threshold.py
    lines: 19-25
    anchors:
      - TestSemanticThreshold
    summary: Threshold test exercises check_if_meaningful with the semantic pipeline
      disabled, duplicating heuristic coverage in test_semantic_check.
  - file: AGENTS.md
    lines: 79-85
    anchors:
      - Semantic justification pipeline
      - PYTHON_SETUP_LINT_RERANKER_MODEL
    summary: Agent context documents the cross-encoder pipeline and env var that the
      modernization must update.
  - file: AGENTS.md
    lines: 87-93
    anchors:
      - Testing Strategy
    summary: Defines the unit/integration/lint gates, including the fit-for-purpose
      integration test over all 13 tools.
  - file: AGENTS.md
    lines: 121-139
    anchors:
      - Pre-commit hooks
    summary: Full lint pipeline runs on commit and fails on NEW violations versus
      the baseline; repo-wide refactors are gated by this.
  - file: CodingRules.md
    lines: 90-107
    anchors:
      - Simplification
    summary: Simplification rules (remove redundant wrappers, duplicated logic,
      over-engineering, redundant checks/fallbacks) are the debloat mandate.
  - file: CodingRules.md
    lines: 139-159
    anchors:
      - Complexity Rules (R0912 / R0915 / C0302) — enforced, not noise
    summary: "Complexity thresholds are enforced: <=16 branches, <=65 statements,
      <=500 lines/module; over-limit modules must be split, not baselined."
  - file: CodingRules.md
    lines: 230-306
    anchors:
      - Tests
      - Test Code Quality
      - Isolation
    summary: Test rules define metrics, mocking at boundaries, categories, naming,
      isolation, fixture scope, and conftest scope used to judge test debloat.
  - file: lint.baseline
    lines: 1-1
    anchors:
      - "[]"
    summary: The lint baseline is empty, so the repo currently tolerates zero
      pre-existing violations; any regression fails the self-lint gate.


## Limits
{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "maxInfraRetriesExpensive": 1,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "hydrationBytes": 40000,
  "contextPackBytes": 40000,
  "timeoutNudgeSec": 300,
  "minFreeDiskMb": 2048
}

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
