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
      "directionalInterfaces": [
        "tests/data/golden/minimal_sample_project_findings.json: sorted JSON array of Finding {tool: str, file: str | None, line: int | None, col: int | None, rule: str}. Crashes are {tool, file: None, line: None, col: None, rule: '__CRASH__'}; golden holds zero, any crash fails naming the tool. Outside sample dir, never copied/linted. violations.txt RETAINED as planted-rule oracle; coverage = every oracle rule in golden.",
        "Runner config: make_runner_config(project: Path) -> RunnerConfig replicating _make_config (package_name='minimal_sample' + rumdl override stripping '\"tests/data\", '). M1 uses existing _make_config; M2 extracts it unchanged.",
        "tests/_golden.py (new, sole golden owner): Finding TypedDict; collect_findings(project, tmp) -> list[Finding] = dedicated second run_lint(config, path='.', baseline=tmp/'capture.json', overwrite_baseline=True) under SEMANTIC=0, read capture, drop msg, relativize+as_posix(), sort, assert len!=0; assert_matches_golden(findings, golden) = Counter multiset diff on 5-tuples with sorted added/removed output; UPDATE_GOLDEN=1 warns+rewrites, fails loudly if CI/GITHUB_ACTIONS set. First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Golden snapshot pins current behavior\n  Given a fresh git-initialised temp copy of tests/data/minimal_sample_project with make_runner_config semantics and PYTHON_SETUP_LINT_SEMANTIC=0\n  When a dedicated capture run (baseline=<tmp>/capture.json, overwrite) reduces records to Finding {tool,file,line,col,rule} (msg dropped, POSIX relpaths, sorted)\n  Then findings equal tests/data/golden/minimal_sample_project_findings.json exactly, len(records)!=0 is asserted, and zero __CRASH__ records exist",
        "Scenario: Behavior drift is reported precisely\n  Given a change adding/removing any finding\n  When `uv run pytest tests/integration.py -v` runs\n  Then the golden assertion fails with a Counter-multiset diff listing every added and removed 5-tuple, sorted",
        "Scenario: Deterministic regeneration\n  Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and no CI env (CI/GITHUB_ACTIONS set fails loudly instead)\n  When the golden test runs twice\n  Then both runs write a byte-identical file (POSIX relpaths, no messages/timestamps/absolutes) with a rewrite warning",
        "Scenario: Planted-rule coverage preserved\n  Given the golden and violations.txt as oracle\n  When coverage is checked\n  Then every oracle rule appears in golden, src/minimal_sample/mod.py:49 ('pre-existing') has an unjustified-suppression record, and mod.py:56 (carry-from) has none (full equality + explicit lookup)"
      ],
      "title": "Golden lint-findings safety net (behavior-preservation contract)"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py: copy_sample_project(tmp_path)->Path; git_init_and_stage(project)->None (init+config+add ., integration/detect-secrets); git_init_bare(cwd)->None (init+config only, autofix staged-file tests); stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; shipped_config_paths()->dict[str,Path]; make_runner_config(project)->RunnerConfig. conftest.py and _autofix_helpers.py delete duplicate defs and import; consumers (integration.py, test_self_lint_clean.py, autofix tests) import from tests._project_helpers. Tests outside tach bounds.",
        "tests/assumptions/{test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contracts.py}: distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts; pytestmark no_external_api; tests/__init__.py added. Root owns __init__ + these 3; semantic epic appends runtime modules only."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given tests/_project_helpers.py defining the 7 helpers\n  When tests/ is searched\n  Then each helper is defined exactly once there and imported (never redefined) by integration.py, conftest.py and _autofix_helpers.py",
        "Scenario: Integration gate module within limits\n  Given extracted helpers plus moved overlay/assertion blocks\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines (target <=480) with no suppression, test names unchanged, all pass, golden byte-identical",
        "Scenario: Third-party contracts pinned\n  Given the explicit astroid/pylint/beartype contract list\n  When `uv run pytest tests/assumptions -q` runs\n  Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api",
        "Scenario: Assumption failures diagnose at the source\n  Given assumption modules as sole pinning location\n  When checker tests are searched\n  Then none asserts third-party internals (Module.stream/doc_node/register shapes); tests/assumptions is the only pinning place"
      ],
      "title": "Test infrastructure and third-party assumptions baseline"
    },
    {
      "directionalInterfaces": [
        "Row schemas: coding-rules {module, section, evidence file:line, category, est. LoC delta, owner, fix}; test-debloat {module, behaviors, duplicate-of, recommendation, surviving coverage, reason, owner}. Artifact = structured item-report tables (no committed file); coding-rules-audit owns the unified disjoint-ownership map; test-debloat-audit contributes LoC estimates + per-limb pinning inventory; iteration-2 replan consumes both.",
        "Symbol-level exclusions (file coverage stays): _base.py::check_if_meaningful (+.pyi), _semantic.py (+.pyi) + new backend/cache modules, no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS, TestSuppressionRerankerPipeline, tests/assumptions runtime modules. Audits list every file, auditing non-excluded symbols normally."
      ],
      "id": "M3",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts); semantic-owned symbols are marked skipped while the rest of those files is audited",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, and each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt",
        "Scenario: Subsystem epics decomposable without overlap\n  Given both audit item reports\n  When iteration 2 is replanned\n  Then runner/checkers/setup-testing-scripts have disjoint ownership from the unified proposal, excluding semantic-owned symbols"
      ],
      "title": "Modernization debt inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model meets all constraints (CPU-friendly, MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community license, 0.81GB bf16, bundled `glide` pkg, tested on 3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g. cc-by-nc-4.0 vs apache-2.0, ONNX exports).",
      "id": "U1",
      "spikeOutlines": [
        "semantic epic fact-finder: candidate matrix (license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision)",
        "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled corpus (repo justifications + test tables); smallest model/prompt/threshold meeting bar (>=90% acc, >=95% meaningless-precision, >=85% meaningful-recall)",
        "semantic epic test-assumptions: install chosen runtime via `semantic` extra on 3.14, pin loader/inference API in tests/assumptions/"
      ]
    },
    {
      "description": "Git-stored cache behavior under concurrency/cleanup from inside pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint invocations sharing one project.",
      "id": "U2",
      "spikeOutlines": [
        "semantic epic test-assumptions: pin pylint 4.x invocation/hook semantics; lock/merge/sweep design conditional on result (else jobs=1 or sidecars)"
      ]
    },
    {
      "description": "Golden must be deterministic across runs/machines. Risks: duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn, absolute-path leakage.",
      "id": "U3",
      "spikeOutlines": [
        "Inside golden-findings-snapshot: capture twice, diff; test-side normalization only (POSIX/sort/msg-drop). Any src parser/baseline fix needed is recorded as blocking debt for iteration 2, not done in-story. Excluding any field that drops a planted oracle rule is forbidden without an ADR."
      ]
    },
    {
      "description": "Size/shape of coding-rules debt in src/ and redundant/lint-testing tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped yet.",
      "id": "U4",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder)",
        "test-debloat-audit (fact-finder)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "description": "Make the integration gate pin exact behavior. Dedicated capture run (SEPARATE from the rc!=0 run): fresh temp copy via _copy_sample+_init_git, config via _make_config (package_name + rumdl override), monkeypatched SEMANTIC=0, run_lint(baseline=<tmp>/capture.json, overwrite_baseline=True); assert len(records)!=0 (not rc). Normalize test-side: drop msg, project-relative POSIX via as_posix(), sort by 5-tuple. New tests/_golden.py owns Finding {tool,file?,line?,col?,rule}, collect_findings(project,tmp), assert_matches_golden (Counter multiset diff, sorted added/removed). Crash records {rule:__CRASH__, nulls} kept; golden holds zero, any crash fails. Keep test_setup_new_and_lint first run (no baseline, rc!=0) unchanged; golden check in same or new test. Replace substring loop with golden equality + oracle coverage (violations.txt RETAINED as oracle; do not delete). Brush-off/carry expressed as golden lookups: mod.py:49 pre-existing HAS unjustified-suppression record; mod.py:56 carry-from has NONE (absence via full equality + explicit lookup). Regen via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (fail loudly under CI/GITHUB_ACTIONS, warn otherwise); verify byte-identical across two runs (U3: test-side normalization only; src fixes deferred as blocking debt; never exclude a field that drops an oracle rule without ADR). No src/ changes. Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-findings-snapshot",
      "title": "Golden snapshot of normalized lint findings"
    },
    {
      "description": "Create tests/assumptions/ (+__init__.py) with distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts (pytestmark no_external_api), tests named test_<api>_given_<condition>_then_<expected>. Contracts: astroid Module.stream()->bytes, doc_node set for module/class/function, nodes_of_class tuple arg, Const/JoinedStr span attrs (fromlineno/end_lineno/col_offset/end_col_offset); pylint CheckerTestCase/UnittestLinter capture, register(linter) plugin shape, MessageDefinitionTuple shape; beartype TYPE_CHECKING-forward-ref behavior VERIFIED during item (assert observed: call-time vs import-time vs checker-only) and discrepancy recorded in item report for M3. No src/ changes.",
      "kind": "test-assumptions",
      "milestoneId": "M2",
      "slug": "third-party-assumption-tests",
      "title": "Pin astroid/pylint/beartype contracts"
    },
    {
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config+add .), git_init_bare (init+config only), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override). Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); update consumers (integration.py, test_self_lint_clean.py, autofix tests). Line budget to reach <=500 (target <=480): helpers ~61 + M1 loop removal ~15 + moved overlay scaffolding (pylintrc rewrite ~30-40) + moved assertion blocks (tool-section/skipped/crash/W9705 ~25-30) + import/docstring trim. tests/integration.py keeps path, class/function names; golden byte-identical; test counts same (update AGENTS.md counts if changed; epic owns pipeline section). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines",
      "deps": [
        "golden-findings-snapshot"
      ]
    },
    {
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Symbol-level semantic exclusions only (check_if_meaningful in _base.py/.pyi, _semantic.py/.pyi, _OPTIONAL_IMPORT_PATTERNS): mark those symbols skipped, audit rest of those files normally (incl. TD-5). Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic (stream read/decode, make_tc), redundant fallbacks (astroid 3.x path), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments (dispatch.py 500+ char), 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner). Runs after golden/assumptions/consolidate so it reads final state + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ]
    },
    {
      "description": "Read-only audit of tests/**. Exclude semantic-owned TestSuppressionRerankerPipeline + semantic test modules (marked skipped). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables ~1400 lines, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks — per broadened never-linting definition); slow/benchmark; task-ID names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*). Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Runs after golden/assumptions/consolidate.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ]
    }
  ],
  "assumptions": [
    {
      "assumption": "'Material lint/check behavior' = findings {tool,file,line,col,rule} pinned by golden (SEMANTIC=0) + checker unit tests; CLI flags/exit codes; baseline/autofix semantics; shipped configs/scopes. Other three limbs are pinned by surviving tests inventoried in M3 (CLI: tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay + config tests) — if a limb has no surviving test the audit flags blocking debt. Reranker accept/reject decisions are not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material.",
      "disposition": "confirm with human",
      "why": "Intent replaces the model yet demands preservation; this boundary makes 'preserve' mechanically testable per limb."
    },
    {
      "assumption": "The git-stored decision cache belongs to the repo being linted (python-setup itself and consumers alike), at .python-setup-decisions.json next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own licenses) stay in the user model cache.",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Dev and CI do not install the `semantic` extra; sentence-transformers absent from .venv today. Gates run heuristic + cache hits; real-model tests are slow + with_real_api.",
      "why": "Matches current .venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py` and `uv run lint` are gate contracts: paths and commands do not change.",
      "why": "Infra gates and AGENTS.md reference them; renaming silently breaks gating."
    },
    {
      "assumption": "'Never test linting' means pytest must not assert this repository passes its own lint gates — whether by re-running tools in subprocess, by AST/source scanning that re-implements a gate, or by config-consistency checks that re-lint the repo. `uv run lint` and pre-commit enforce that. Tests exercise logic on synthetic inputs and the sample project.",
      "why": "AST guards and config re-checks duplicate the gate and rot with rule churn; broadening the definition removes them with rationale.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Only semantic-decision-model starts now; runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3 audits. Semantic starts under the symbol-level sequencing protocol (AGENTS.md rebase, golden regen after M1, shared-file symbols, assumptions append-only).",
      "why": "Debloat follows safety net + assumptions; sequencing prevents concurrent edits to shared files."
    },
    {
      "assumption": "At least one model among GLiDE-0.4B and smaller Decision-Index models has compatible license, Python 3.14 CPU wheels and pinnable revision. Else the semantic epic escalates instead of shipping non-compliant.",
      "why": "GLiDE uses a custom community license, tested on 3.12; smaller candidates vary.",
      "disposition": "verify via semantic-decision-model spikes"
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind suppression-justification with a CPU-friendly small decision model plus a git-stored self-cleaning decision cache. Preserve every material behavior. Child epic of `modernize`.\n\n## Scope (symbol-level; file-disjoint is false)\nOwned symbols/files: checkers/_semantic.py+.pyi and new private backend/cache modules (+.pyi each, @beartype, structlog kwargs, tach-clean); check_if_meaningful in checkers/_base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore semantic entries; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache modules, tests/checkers/conftest.py, new runtime-assumption modules under tests/assumptions/.\nSequencing with root: AGENTS.md — epic owns pipeline section only, rebases after root M2 test-count edits; shared .py files — symbol ownership only, no whole-file transfer; tests/assumptions — root owns __init__ + 3 contract modules, epic appends runtime modules only; golden — root M1 creates, epic req5 regen only after M1 committed (ordered edge).\nOut of scope: other checkers/runner; tests/integration.py, tests/conftest.py (no edits); tests/data/** except the explicit minimal exception of golden regen under req5 (same change, ADR + diff review). Any runner touch (e.g. cache path to pylint) stays minimal + ADR.\n\n## Requirements\n1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B + Decision-Index smalls): license (exclude non-commercial), params/size, runtime (torch+transformers vs onnxruntime+tokenizers) with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only: cold-load, warm latency, accuracy on labeled corpus (repo's real justifications + today's brush-off/meaningful tables); bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful; choose smallest model/prompt/threshold meeting bar, record in ADR. (c) test-assumptions: pylint 4.x invocation semantics (jobs, per-tool processes, open()/close() timing, partial/staged runs); cache lock/merge/sweep design is conditional on this — if jobs>1 violates partial-run guarantee, constrain decision runs to jobs=1 (pinned by test) or per-worker sidecars.\n2. Decision contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool and PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' constants; decision=prob>=threshold. Injection: semantic_... gains optional backend kwarg (public in .pyi); get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path (instance or zero-arg factory). No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra or on failure: heuristic + cache hits, one warning, sentinel (no retry storm). Weights in user model cache, never git. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root, definitive): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized (strip+collapse ws, keep case), rule (joined codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision, files (sorted POSIX relpaths)}. Key (justification,rule,model); context is model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop empty-files + stale-model entries. Isolation: PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass all tools incl. detect-secrets.\n5. Real suppressed codes: extract all codes from disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split comma), sort, join ','; pass joined string as rule (bare-except keeps single 'bare-except-comment'). Rule-echo rejects if primary (lower, stripped) equals any element (lower). Cache key uses joined rule. If any heuristic outcome on the sample changes, regen golden with PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 in same change (after M1), review diff, record behavior-change description (which justification classes flip) in CHANGELOG — not the raw diff.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; backend via FakeBackend (direct kwarg for units, env-var for check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp paths + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` assertions; modules <=500 lines, no suppressions; never test linting.\n7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents, new/deprecated vars, cache file, behavior-change descriptions).\n\n## Acceptance\n- Heuristic path unchanged: SEMANTIC=0 sample lint equals golden.\n- Cache without model: no extra + cached false decision => W9704 emitted, no model load.\n- Brush-off never reaches model: 'pre-existing' + fake backend => False, backend uncalled.\n- One call per unique pair: miss + backend => exactly one call per unique (justification,rule), persisted sorted.\n- Scoped cleanup: suppression deleted from a.py => linting a.py removes entry; linting only b.py keeps it.\n- No retry storm: load fails => one attempt per process, heuristic results.\n- Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv run lint` pass with empty lint.baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Suppression/bare-except checkers pass their own symbol as `rule`; the rule-echo heuristic and model never see the actually-suppressed codes.",
      "id": "TD-1",
      "resolution": "Semantic req5: extract all codes, pass comma-joined sorted string; echo matches any element; golden regen + CHANGELOG behavior description if outcomes shift."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore; several assertions vacuous (`is None or ...`).",
      "id": "TD-2",
      "resolution": "Semantic req6: FakeBackend via public Protocol (direct kwarg + dotted-path env injection); delete vacuous tests."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 627 lines + too-many-lines suppression; duplicates conftest/_autofix helpers; substring-only assertions miss drift.",
      "id": "TD-3",
      "resolution": "M1 pins exact findings; M2 single-sources 7 helpers, moves overlay/assertion blocks, reaches <=500 without suppression."
    },
    {
      "category": "impacting",
      "description": "test_semantic_check.py 506 lines + suppression; heuristic tables duplicate test_semantic_threshold.py.",
      "id": "TD-4",
      "resolution": "Semantic req6: one merged parametrized table; modules <=500."
    },
    {
      "category": "adjacent",
      "description": "~15 checkers repeat structural suppressions (missing-beartype on register(), type:ignore[misc] on mixin classes) + copied stream read/decode.",
      "id": "TD-5",
      "resolution": "coding-rules-audit inventories; iteration-2 checkers epic fixes (base class, shared helper, typed register)."
    },
    {
      "category": "adjacent",
      "description": "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools, _compare_sorted re-export, astroid 3.x docstring fallback despite astroid>=4.0.4.",
      "id": "TD-6",
      "resolution": "Iteration-2 runner/checkers epics remove, guarded by golden."
    },
    {
      "category": "adjacent",
      "description": "dispatch.py 500+ char rationale comment ending in `# pylint: disable=unjustified-suppression` suppresses the justification checker itself.",
      "id": "TD-7",
      "resolution": "Iteration-2 runner epic: move rationale to design/0002, leave short justified comment."
    },
    {
      "category": "adjacent",
      "description": "tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables typed list[Any] with pasted justifications; cases far from tests.",
      "id": "TD-8",
      "resolution": "Iteration-2 checkers epic per test-debloat-audit: ParameterSet typing, cases next to tests, split per checker."
    },
    {
      "category": "adjacent",
      "description": "Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*); repo-self-lint tests (test_self_lint_clean.py, AST/source-scanning guards, config re-checks) duplicate the `uv run lint` gate.",
      "id": "TD-9",
      "resolution": "Iteration-2 epics per test-debloat-audit: rename by behavior; remove self-lint tests (broadened never-linting definition)."
    },
    {
      "category": "adjacent",
      "description": "ADR locations disagree: CodingRules requires design/, factory ADRs go to docs/adr.",
      "id": "TD-10",
      "resolution": "Iteration-2 replan: cross-reference (design/README or AGENTS.md index). No engine change."
    },
    {
      "category": "adjacent",
      "description": "Shipped rumdl.toml excludes tests/data, forcing the integration per-run rewrite to lint the sample AGENTS.md; affects golden determinism.",
      "id": "TD-11",
      "resolution": "coding-rules-audit inventories; iteration-2 runner epic fixes (e.g. narrow exclude); M1/M2 retain the override."
    }
  ],
  "adrs": [
    {
      "consequences": "Regression detection across all tools and checkers becomes exact and cheap; golden updates are explicit review points. Message text is not snapshotted. Tool upgrades via uv.lock may require reviewed regeneration. CI cannot silently rewrite the golden.",
      "context": "The modernization enforces coding rules, debloats code/tests, and swaps the semantic model while preserving every material behavior. lint.baseline is empty. The integration test only checks planted rule-name presence, so duplicates, moved lines and new false positives go undetected.",
      "decision": "Commit a normalized snapshot of every finding, Finding {tool, file, line, col, rule} (file/line/col nullable for __CRASH__), for tests/data/minimal_sample_project at tests/data/golden/minimal_sample_project_findings.json (outside the linted project). Produce it via a dedicated second run_lint capture (baseline=<tmp>/capture.json, overwrite_baseline=True) under PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config semantics (package_name + rumdl override); the first run keeps its rc!=0 assertion and the capture asserts len(records)!=0. Normalize test-side: drop msg, project-relative POSIX via as_posix(), sort by 5-tuple. Diff via Counter multiset on 5-tuples with sorted added/removed output. Golden must contain zero __CRASH__; any crash fails. violations.txt is retained as the planted-rule oracle (coverage = every oracle rule in golden). Regenerate only with PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (fails loudly under CI/GITHUB_ACTIONS, warns otherwise), byte-identical across two runs. No field exclusion that drops an oracle rule without an ADR; src parser fixes are deferred as blocking debt.",
      "id": "ADR-001",
      "title": "Golden findings snapshot as the behavior-preservation contract"
    },
    {
      "consequences": "Brush-off rejections are guaranteed regardless of model; model can only tighten acceptance. sentence-transformers is dropped; no-try-import patterns list the new runtime. Real-model coverage is one slow + with_real_api test. Old env var warns via CHANGELOG-documented deprecation.",
      "context": "_semantic.py misuses a sentence-transformers cross-encoder as a quality judge. The dependency is heavy and absent in dev/CI, so the heuristic decides everything today. The intent asks for a CPU-friendly small decision model.",
      "decision": "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC. Heuristic runs first as a hard gate; rejections never reach the model. Accepted text goes to cache, then to a local decision model behind a public DecisionBackend Protocol decide(justification, rule, context) -> float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with PROMPT_VERSION='prompt-v1'. Injection without patching: semantic_check_if_meaningful gains optional backend kwarg (public in .pyi), and get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold chosen by spike under compatible license, Python 3.14 CPU wheels, pinned revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful. Ships via `semantic` extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend unavailable returns None; heuristic stands.",
      "id": "ADR-002",
      "title": "Heuristic-gated local decision model for justification checks"
    },
    {
      "consequences": "W9704 reproducible across machines without the extra; decision changes are reviewable diffs. Small line-local merge conflicts possible. Consumer repos gain one committed file (install docs mention it); the file must pass all tools and not trip detect-secrets.",
      "context": "Results cached in gitignored ~/.cache per-machine file, unbounded, keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge across machines; stale entries never removed. Intent requires git-stored cache with cleanup.",
      "decision": "Store decisions in committed .python-setup-decisions.json at the linted project root (definitive, next to lint.baseline). Format: JSON array sorted by (rule, justification, model), indent=2, sort_keys=True. Entry {justification (normalized: strip + collapse whitespace, preserve case), rule (comma-joined sorted codes), model ('<id> rev <short12> prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX relpaths}. Key is (justification, rule, model); context is model input only. Reads need no model. Writes: lockfile + merge-on-write + atomic temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted files + drop empty-files and stale-model entries. Isolation via PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep confirmed by pylint-semantics spike; if jobs>1 violates partial-run guarantee, constrain to jobs=1 (pinned by test) or per-worker sidecars — chosen in ADR. Weights stay in user model cache.",
      "id": "ADR-003",
      "title": "Git-stored, self-cleaning decision cache"
    },
    {
      "consequences": "Shared test infra never edited concurrently; debloat runs behind golden + assumptions. Source and its tests stay together per subsystem. Subsystem epics start one iteration later but scoped from evidence. Symbol-level sharing needs review discipline on 4 files.",
      "context": "Three workstreams span ~28.6k LOC. Parallel edits to shared test infra would conflict. Intent requires test infra/assumptions before debloat. The semantic epic is not file-disjoint (AGENTS.md, _base.py, no_try_import_checker.py, one test class, tests/assumptions, golden dir), so whole-file disjointness is false.",
      "decision": "Iteration 1: root delivers golden safety net, test-infra consolidation, third-party assumption tests, plus read-only audits, and spawns semantic-decision-model now under a symbol-level sequencing protocol: (a) AGENTS.md — root M2 owns test-count lines, epic owns pipeline section, epic rebases after M2; (b) golden — root M1 creates the file, epic req5 regen only after M1 committed; (c) shared .py files — symbol-level ownership, rest of file stays auditable; (d) tests/assumptions — root owns __init__ + 3 contract modules, epic only adds runtime modules; (e) golden regen is the epic's sole tests/data exception with ADR + diff review. Iteration 2 (replan): spawn runner, checkers, setup-testing-scripts epics with disjoint ownership from the audits. Policy: pytest never asserts this repo passes its own lint gates (no subprocess re-lint, no AST re-implementation, no config re-checks); `uv run lint` does that.",
      "id": "ADR-004",
      "title": "Progressive saga decomposition with symbol-level sequencing"
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
