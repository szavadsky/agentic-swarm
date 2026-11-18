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
  - Size estimates (advisory only, never blocking): outlines may carry a `prodBudgetHint` (estimated prod lines); note missing hints and hints above the kind's sizing reference (`storyMaxProdLines`/`simpleMaxProdLines` in `{
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
}`) as advisory observations. A plan is never failed, looped, or consulted on sizing hints alone.
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
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "runner/dispatch.py TOOLS[1]=ToolSpec('ruff format', ['ruff','format'], supports_fix=False, default_paths=['src/','tests/']); runner/_config.py maps 'ruff format'->'ruff.toml'; cmd_build._config_flag_for returns ['--config', path] and _build_command appends '--check' when not fix; cli.py phase 1a formats only under --fix, normal pass checks.",
        "Registry invariant single source: EXPECTED_TOOLS=frozenset(t.name for t in TOOLS) with len 14; RECORD_PARSER_TOOLS subset; FORMATTER_ONLY={'ruff format'} explicitly exempt from statistics-parser coverage; tests import it instead of hardcoding 13.",
        "Docs contract: AGENTS.md counts = runtime collect-only + len(TOOLS)==14; cli.py:314 help 'all 14 tools'; tool_counts.json keeps 14 keys including 'ruff format':0."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green on clean checkout\n  Given clean HEAD with empty lint.baseline\n  When format, lint, `pytest -q`, and integration gates run\n  Then all pass: 6 tool-count failures fixed, SIM102 and too-many-locals fixed, lint.baseline stays []",
        "Scenario: Lint never mutates\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then git status shows no tracked modifications and ruff format runs with --check --config config/ruff.toml",
        "Scenario: Registry contract single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every assertion reads 14 from one helper and formatter-only exemption is explicit"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py (sole site): copy_sample_project, git_init_and_stage (test/test@test + add .), git_init_bare (Test/test@example.com, -q, no add), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, idempotent, no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Consumers import mapped subsets only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] via private pipeline subset + _RECORD_PARSERS, normalize, sort by finding_key, assert len!=0 and zero __CRASH__; assert_matches_golden Counter-multiset diff with UPDATE guard (pytest.fail under CI/GITHUB_ACTIONS); read_oracle_rules, slice_tool_section (used by overlay test), assert_oracle_coverage, assert_tool_coverage."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each helper is defined exactly once there, duplicates in conftest.py and _autofix_helpers.py are deleted, and each consumer imports only its mapped subset",
        "Scenario: Integration gate within limits\n  Given extracted helpers plus moved scaffolding (>=127 removed, target <=490)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with no suppression, names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening holds\n  Given the committed golden\n  When integration runs plus synthetic drift injection\n  Then findings are sorted with len!=0 and zero __CRASH__, drift names exact added/removed keys, oracle and per-tool coverage hold, and regen twice is byte-identical"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; labelled corpus = threshold patterns + brush-off/meaningful tables + real repo suppressions; eval report {model, threshold, precision, recall, p50/p95 latency, RSS, recommendation}.",
        "Tracked cache JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; entry {version, model id/revision, prompt hash, full digest key, decision, files sorted POSIX, last-seen}; refresh via explicit command/flag only; CI guard refuses rewrite; isolation via PYTHON_SETUP_LINT_DECISIONS_PATH.",
        "Pylint semantics contract: jobs/process count, open()/close() timing, partial/staged-run behavior across pylint/pylint-pyi/pylint-tests; verdict selects lock/merge/sweep vs jobs=1 vs sidecars."
      ],
      "id": "M3",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Model choice is evidence-based\n  Given the labelled corpus on CPU\n  When the poc scores decider-nano (+GLiDE if obtainable) at 0.5/0.6/0.7\n  Then the report names precision/recall/latency per threshold and recommends the smallest compliant model+prompt+threshold or a no-go",
        "Scenario: Cache design is deterministic\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present, and cache-hit\n  Then verdicts are identical, prune policy drops stale/deleted entries, and normal lint performs zero writes",
        "Scenario: Cache concurrency is pinned\n  Given pylint 4.x invocation tests\n  When jobs/hook/partial-run semantics are pinned\n  Then the cache lock/merge/sweep design is confirmed or constrained to jobs=1/sidecars by test"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Row schemas: coding-rules {module, section, evidence file:line, category, est. LoC delta, owner, fix}; test-debloat {module, behaviors, duplicate-of, recommendation, surviving coverage, reason, owner}. Artifact = structured item-report tables (orchestration records; no committed file); coding audit owns the unified map; test audit aligns via inter-dep; iteration-3 replan re-globs HEAD before spawning epics.",
        "Exclusions (marked skipped): src side _semantic.py+.pyi, new backend/cache modules, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests side test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, epic-created conftest/runtime modules."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts module is listed with violations plus the unified ownership map; semantic symbols are marked skipped",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, and each material limb names pinning tests or blocking debt",
        "Scenario: Ownership map is complete and disjoint\n  Given both audit reports\n  When the unified map is checked\n  Then every src/scripts/tests file appears exactly once with exactly one owner and no file has two owners"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + accuracy is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives (decider-nano 149M, bekko-17m, ettin-150m) vary in accuracy/license/CPU proof. No CPU benchmark exists in this environment.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision",
        "model-eval-poc (poc, CPU-only): precision/recall at 0.5/0.6/0.7 + latency/RSS on labelled corpus; smallest compliant model/prompt/threshold or no-go",
        "decision-runtime pinning (test-assumptions, inside eval report + pylint-cache-assumptions follow-up if chosen runtime needs API pinning)"
      ]
    },
    {
      "description": "Git-stored cache location/schema/key/cleanup/update semantics and pylint concurrency behavior are unknown. Open: full digest vs truncated, model-rev/prompt-hash in key, code_context inclusion, prune policy, refresh command, CI guard, jobs/open/close/partial-run coordination.",
      "id": "U2",
      "spikeOutlines": [
        "cache-design-spike (poc on temp copies): schema + prune + refresh/CI/isolation + determinism proof (absent/present/hit) with zero normal-lint writes",
        "pylint-cache-assumptions (test-assumptions): pin jobs/process/open/close/partial-run semantics; verdict selects lock/merge/sweep vs jobs=1 vs sidecars"
      ]
    },
    {
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) is unmeasured; subsystem epics cannot be scoped without the unified ownership map.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder, single owner of unified map)",
        "test-debloat-audit (fact-finder, aligned via inter-dep)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14 tools. Map 'ruff format' to config/ruff.toml in runner/_config.py, return --config in cmd_build._config_flag_for, append --check in _build_command for the normal pass; keep mutating format only in phase 1a under --fix. Single-source the registry invariant (EXPECTED_TOOLS + FORMATTER_ONLY={'ruff format'} exempt from statistics-parser coverage) and update the 6 failing tests + AGENTS.md counts + cli.py:314 help to 14. Verify: format/lint/test/integration gates; `git status` clean after `uv run lint` (no --fix); golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 50,
      "slug": "runner-format-contract",
      "title": "Ruff format check-only contract and 14-tool fix"
    },
    {
      "deps": [],
      "description": "Fix the two masked violations with behavior-preserving refactors only: coverage.py:196-198 SIM102 nested-if -> single `if a and b`; cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). Keep lint.baseline []. Verify: lint gate green for these rules; integration + `pytest -q` show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 30,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102 and too-many-locals"
    },
    {
      "deps": [
        "runner-format-contract",
        "baseline-violations-fix"
      ],
      "description": "Retry per consult guidance. Create tests/_project_helpers.py with the 10 helpers (copy, git_init_and_stage with test/test@test + add ., git_init_bare with Test/test@example.com -q no add, stage/commit, shipped_config_paths, make_runner_config preserving rumdl side-effect contract, overlay/precommit/install scaffolds). Delete duplicates in conftest.py and tests/runner/_autofix_helpers.py; per-consumer imports only; meet line budget (>=127 removed, <=500, no suppression). FORBIDDEN: lint.baseline, AGENTS.md, docs/**, src/** (tests/** only). Red-test-exempt tests-only refactor. Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines"
    },
    {
      "deps": [
        "consolidate-integration-helpers"
      ],
      "description": "Harden merged tests/_golden.py without changing the committed golden: sort by finding_key in collect, assert len!=0 and zero __CRASH__ records, keep Counter-multiset diff + UPDATE guard + oracle/tool coverage, use slice_tool_section in the overlay test, extend tests/test_golden.py synthetic coverage. Tests-only; no regen unless a reviewed diff proves drift (CI guard enforced). Verify: integration + test_golden pass; golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden helpers and assertions"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m (+MiniLM baseline): license, params/weights size, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino license for human review.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "model-candidate-matrix",
      "title": "Decision-model candidate matrix"
    },
    {
      "deps": [
        "model-candidate-matrix"
      ],
      "description": "No committed code; report only (temp venv/copy permitted, network only inside spike). Assemble labelled corpus from test_semantic_threshold.py + test_semantic_check.py patterns + real repo suppressions. Score decider-nano on CPU (+GLiDE-0.4B if obtainable) at 0.5/0.6/0.7: precision/recall, CPU latency/RSS. Recommend smallest model+prompt+threshold meeting the bar, veto-vs-replace mode, or no-go with evidence.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "model-eval-poc",
      "title": "CPU accuracy/latency evaluation"
    },
    {
      "deps": [
        "model-candidate-matrix"
      ],
      "description": "Prototype on temp copies only; no committed files. Design tracked JSON schema (version, model id/revision, prompt hash, full digest key, boolean, last-seen), prune policy, refresh command/flag, CI guard, PYTHON_SETUP_LINT_DECISIONS_PATH isolation. Prove deterministic W9704 with model absent/present/cache-hit and lockfile + merge + atomic replace. Record read-only-lint decision.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "cache-design-spike",
      "title": "Tracked cache schema and determinism prototype"
    },
    {
      "deps": [],
      "description": "Pin pylint 4.x invocation semantics the cache design relies on: jobs/process count, checker open()/close() timing, partial-path and staged-file runs, 3 pylint invocations sharing one project. Add tests/assumptions/test_pylint_cache_semantics.py (no_external_api, test_<api>_given_<condition>_then_<expected>). No src changes. Record verdict: lock/merge/sweep viable vs jobs=1 constraint vs sidecars.",
      "kind": "test-assumptions",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-cache-assumptions",
      "title": "Pin pylint invocation semantics"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit src/** and scripts/** vs CodingRules/AGENTS with symbol-level semantic exclusions (_semantic.py+.pyi, new backend/cache modules, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS). Output rows {module, section, evidence, category, LoC delta, owner, fix} + UNIFIED disjoint-ownership map (single owner). Reads final HEAD + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "coding-rules-audit"
      ],
      "description": "Read-only; zero repo writes. Audit tests/** with semantic exclusions (semantic check/threshold modules, TestSuppressionRerankerPipeline, epic-created conftest/runtime modules). Output rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory. Owner column aligned to the unified map via inter-dep.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material.",
      "disposition": "confirm with human",
      "why": "Makes 'preserve every material behavior' mechanically testable while allowing the model swap."
    },
    {
      "assumption": "Git-stored decision cache lives in the linted repo (e.g. .python-setup-decisions.json next to lint.baseline); weights stay in the user model cache, never in git.",
      "disposition": "confirm with human",
      "why": "Decisions must reproduce in CI without the model; weights are 0.03-0.8GB with their own licenses."
    },
    {
      "assumption": "Dev/CI do not install the `semantic` extra; gates run heuristic + cache hits. Real-model tests are slow + with_real_api and never in the default suite.",
      "why": "Matches current venv (no torch/transformers) and keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration behavior contracts are retained, not removed.",
      "disposition": "confirm with human",
      "why": "Removes gate-duplicating tests without deleting the fit-for-purpose behavior contract."
    },
    {
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes prefer Apache-2.0 candidates and exclude CC-BY-NC. If no candidate meets license + CPU + py3.14 + accuracy bar, the epic escalates instead of shipping non-compliant.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial model licensing by default."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py`, split format/lint gates are gate contracts; paths/commands do not change. Never run bare `uv run lint` or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates the worktree via ruff format; split gates are the check-only workaround until M1 merges."
    },
    {
      "assumption": "Only semantic-decision-model spawns now (implementation in iteration 3 after spikes); runner/checkers/setup epics spawn at the iteration-3 replan from M4 audits.",
      "why": "Debloat and model work must follow the green baseline, consolidated infra, and evidence-based ownership."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind suppression-justification with a CPU-friendly small decision model plus a git-stored self-cleaning decision cache. Preserve every material behavior. Child epic of `modernize`. Consumes iteration-2 spikes (candidate matrix, CPU eval, cache design, pylint semantics); implements in iteration 3.\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi and new private backend/cache modules (+.pyi each, @beartype, structlog kwargs, tach-clean); check_if_meaningful in checkers/_base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore entries + hatch inclusion for tracked cache; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache modules, tests/checkers/conftest.py, runtime-assumption modules under tests/assumptions/.\nProtocol: NEVER write tests/data/** (read golden for verification only); if heuristic outcomes shift, emit shift report + CHANGELOG behavior description and root regenerates golden. AGENTS.md pipeline section only on HEAD containing M2 merge, never count lines. tests/assumptions append-only. Out of scope: other checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any runner touch minimal + ADR.\n\n## Requirements\n1. Implement the spike verdict: chosen model id/revision, prompt (noul question + criteria), threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall, or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial licenses.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool and PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION constants. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra or on failure: heuristic + cache hits, one warning, sentinel. Weights in user cache, never git. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' with no bare hex>=20, decision, files sorted POSIX relpaths}. Key (justification,rule,model). Normal lint read-only; explicit refresh command/flag writes via lockfile + merge + atomic temp+move. Sweep scoped to linted files; drop empty-files + stale-model entries. Isolation via PYTHON_SETUP_LINT_DECISIONS_PATH. Must pass all tools incl. detect-secrets.\n5. Real suppressed codes: extract all codes from disable/noqa/ignore, normalize/sort/join ','' as rule (bare-except keeps single symbol). Rule-echo rejects on any element match. On heuristic shift: shift report + CHANGELOG description, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; FakeBackend via kwarg + env var; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` assertions and ImportError-propagation test; modules <=500 lines, no suppressions; never test linting.\n7. Docs: update Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification).\n- Cache without model: cached false decision => W9704 emitted, no model load.\n- Brush-off never reaches model; one call per unique (justification,rule); scoped cleanup; no retry storm.\n- Gates: format, lint, `pytest -q`, integration all green with empty lint.baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default line-length 88 vs shipped 130); every `uv run lint` dirties ~109 files.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: shipped-config --check in normal pass, mutating format only in phase 1a under --fix."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 tests assert 13 tools vs 14-entry TOOLS; SIM102 at stub/coverage.py:196; too-many-locals 23/20 at runner/cli.py:50. Empty lint.baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool update) + baseline-violations-fix (SIM102 + split pipeline); lint.baseline stays []."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines suppression; helpers duplicated across integration/conftest/_autofix_helpers.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, golden byte-identical, <=500, no suppression)."
    },
    {
      "category": "impacting",
      "description": "Golden interface drift: collect signature/behavior vs plan, missing sort/len/crash asserts, unused slice_tool_section.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening (ratify + harden, no blind regen)."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic implementation in iteration 3 (FakeBackend injection, merged table, modules <=500)."
    },
    {
      "category": "impacting",
      "description": "W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic and future model never see the actually-suppressed codes.",
      "id": "TD2-I4",
      "resolution": "Resolved by semantic epic req5 (joined suppressed codes, echo on any element, shift report + root regen)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit/duplicated test infrastructure: _factories.py 1393 lines, _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff + 3 runner files overlapping, test_golden.py 341 lines of helper-unit tests.",
      "id": "TD2-A1",
      "resolution": "Inventoried by test-debloat-audit; iteration-3 checkers/runner epics merge/split per CodingRules."
    },
    {
      "category": "adjacent",
      "description": "Legacy/compat and docs drift: _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py 500+ char rationale with self-suppression, rumdl tests/data-exclude hack, ADR design/ vs docs/adr split, factory-journal detect-secrets noise.",
      "id": "TD2-A2",
      "resolution": "Inventoried by audits; iteration-3 epics remove/fix; factory-journal exclusion is operator/engine action if still flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "`uv run lint` becomes check-only and hermetic; declared split gates can reunify once merged. Tool-count docs/tests stabilize on 14. Phase 1a keeps mutating format under --fix only.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config, rewriting ~109 files with default line-length 88 instead of shipped 130, while TOOLS has 14 entries and 6 tests + docs assert 13.",
      "decision": "Retain 14 tools. Map 'ruff format' to config/ruff.toml, pass --config, append --check in the normal pass; mutate only in phase 1a under --fix. Single-source the 14-name registry invariant; formatter-only tools are explicitly exempt from statistics-parser coverage.",
      "id": "ADR-005",
      "title": "Ruff format check-only contract with shipped config"
    },
    {
      "consequences": "Golden stays byte-identical; drift detection gains explicit crash/empty sensitivity. Overlay test uses the shared slicer. No blind regen.",
      "context": "Merged collect_findings uses private pipeline + record parsers (not run_lint baseline capture), sorts only in serialize, never asserts len!=0 or zero __CRASH__, and slice_tool_section is unused.",
      "decision": "Ratify private-pipeline collect as intentional (avoids second full run and formatter pollution). Harden it: sort by finding_key in collect, assert len!=0 and zero __CRASH__, use slice_tool_section in the overlay test.",
      "id": "ADR-006",
      "title": "Golden contract hardening on merged implementation"
    },
    {
      "consequences": "Lint stays hermetic and deterministic with/without the model; cache updates are explicit, reviewable, CI-guarded. Iteration 3 implements the backend against this contract.",
      "context": "Current cache is per-machine, gitignored, unbounded, 64-bit truncated keys, no cleanup. A git-tracked cache that lint writes on every run would make lint non-hermetic.",
      "decision": "Tracked cache is the source of truth; normal lint is read-only (cache-hit + heuristic). Writes happen only via an explicit refresh command/flag. Schema carries version, model id/revision, prompt hash, full digest key, boolean, last-seen; prune policy proven by spike.",
      "id": "ADR-007",
      "title": "Read-only lint with explicit cache refresh"
    },
    {
      "consequences": "Subsystem epics start in iteration 3 scoped from evidence with disjoint ownership; semantic implementation follows spike verdicts. No concurrent edits to shared test infra.",
      "context": "Remaining scope spans runner, checkers, setup/testing plus the semantic swap. Audits must read final post-consolidation HEAD before epic decomposition.",
      "decision": "Iteration 2 delivers green baseline, test-infra completion, model/cache spikes, and read-only audits. Iteration 3 spawns runner/checkers/setup-testing-scripts epics from the unified ownership map plus the semantic implementation epic.",
      "id": "ADR-008",
      "title": "Progressive epic decomposition after audits"
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
