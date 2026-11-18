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
  "maxEmptyWaves": 3,
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
  "maxEmptyWaves": 3,
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
  "iteration": 5,
  "milestones": [
    {
      "id": "M1",
      "title": "Test infrastructure and decision contracts first",
      "directionalInterfaces": [
        "Cache contracts (NEW tests/assumptions/test_decision_cache_contracts.py, no_external_api): round-trip sorted indent=2/sort_keys, no bare hex>=20, detect-secrets clean on tmp file, read-only hash (byte-hash before/after ordinary run_lint unchanged), refresh CI-guard refuses under CI/GITHUB_ACTIONS (golden-guard shape tests/_golden.py:374-392), prune missing-files + stale-model-ids, --path retains unscanned, jobs==1 required else loud fail (reuse writer-first verdict test_pylint_cache_semantics.py:225-355, cite file:line, do not re-derive).",
        "Loader contracts (NEW tests/assumptions/test_decision_loader_contracts.py, no_external_api): production ignores PYTHON_SETUP_LINT_DECISION_BACKEND without PYTEST_CURRENT_TEST (both branches pinned, do not weaken _decision_backend.py:37-46), missing [semantic] extra / get_backend() None maps to heuristic bool with exactly-one structlog warning for DECISION_MODEL, PROMPT_VERSION folded into production model_id once wired (shape '... prompt-vN', FakeBackend already complies).",
        "Model spikes (report-only, zero committed files): candidate matrix {license, params/size, runtime, py3.14 CPU wheels linux/mac/win, custom-code/vendoring, pinnable revision, offline}; corpus pilot {N>=100 post-dedup, both strata non-empty, rubric, two-pass blinded + adjudication + agreement, per-source/stratum split} or explicit blocker; CPU eval {veto-only at 0.5/0.6/0.7, 90/95/85 bars on heuristic-accepted stratum, cold-load/warm p50/p95 + RSS, GLIDE_MAX_BATCH=1 determinism, smallest compliant or no-go}; runtime pinning (conditional on go, else report-only skip).",
        "Pyi spike (report-only): {reproduction companion-vs-orphan on tmp, golden counts recount at HEAD, latent budget recount (symbols + duplicate-code), recommendation fix-with-regen vs orphan-only with I5 budget/regen plan}."
      ],
      "scenarios": [
        "Scenario: Cache and loader contracts pinned before implementation\n  Given HEAD with in-process memo only and no tracked cache\n  When cache/loader assumption items merge\n  Then new assumption modules pass offline, assert live contracts only (no raising=False vestiges), and M3/M4 implementations consume them via deps without loosening",
        "Scenario: Model verdict is evidence-based or explicitly blocked\n  Given the 215/0 no-go history and Fastino review open\n  When matrix + corpus + CPU eval complete\n  Then the report cites license verdict per candidate, CPU latency/RSS per threshold, 90/95/85 compliance on the accepted stratum, and recommends the smallest compliant model+prompt+threshold or a no-go/blocker with evidence; no model code ships on no-go",
        "Scenario: Pyi scope decided with budget\n  Given 42/43 pyi findings on .py and 205 latent symbols (verify at HEAD)\n  When the pyi spike completes\n  Then the verdict recommends fix-with-regen (with strategy + cleanup budget + regen plan) or orphan-only (with scope-note text), and M5 consumes it without re-proving reproduction"
      ]
    },
    {
      "id": "M2",
      "title": "Test harness and source debloat (behavior-preserving)",
      "directionalInterfaces": [
        "Checker harness single-sourced: testing.py gains open_checker/module_name options on _walk_and_release/_make_tc (backward-compat defaults preserving current call shapes); 13 _make_tc + 10 _walk_and_release + 8 _msg_ids local copies deleted (grep zero, recount at HEAD); SourceRootMixin callers pass open_checker=True; behavior identical.",
        "Semantic/runner doubles single-sourced: one _RecordingBackend (NEW tests/checkers/_decision_test_doubles.py or testing.py extension, item reports placement + import graph), one _semantic_disabled fixture (tests/checkers/conftest.py), one _UvCallRecorder, one extra_block; dead helpers deleted (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project) with grep-zero proof; vestigial cache tests rewritten to live hash/tmp contracts (no raising=False on retired attrs); smoke kept-narrowed or removed with survivor map to integration + fake orchestration.",
        "Source simplifications (no behavior change): _semantic memo dict + .clear() (drop both globals + nullable), _base boilerplate/phrase frozensets at module level, dispatch pyi/tests rcfile paths via _resolve_pylintrc (single implementation), checkers __init__ module docstring; FORBIDDEN _decision_backend/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading (M3), tests/data, baseline, docs."
      ],
      "scenarios": [
        "Scenario: Harness deduped without intent loss\n  Given duplicated wrappers/doubles/dead helpers at HEAD\n  When M2 merges\n  Then grep shows zero local copies, all touched modules <=500 with no new suppressions, 115-row heuristic table + W9704/W9738 checker behavior tests pass unchanged, no new failures vs I5 HEAD gates, golden hash-equal",
        "Scenario: Source simplified without drift\n  Given placeholder globals, per-call sets, duplicated rcfile blocks\n  When simplifications merge\n  Then behavior identical (heuristic outcomes + tool commands byte-identical in tests), modules <=500, tach/typing clean, no new failures, golden hash-equal"
      ]
    },
    {
      "id": "M3",
      "title": "Git-stored decision cache with cleanup",
      "directionalInterfaces": [
        "Storage (NEW python_setup_lint/decisions/_decision_cache.py + .pyi, @beartype, structlog, tach-clean, <=500): .python-setup-decisions.json at linted root (array sorted by (rule, justification, model), indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized (strip+collapse ws, keep case), rule joined codes, model '<id> rev <short12> prompt-vN', score float [0,1] + decision bool (re-thresholdable), files sorted unique POSIX} + {version, prompt hash, last-seen}; key (justification, rule, model); context is model input only (NOT in key); PROMPT_VERSION folded into model string.",
        "Refresh (runner CLI --refresh-decisions [--path ...], RunnerConfig threading, help text): explicit only, FAILS under CI/GITHUB_ACTIONS (golden-guard shape), PYTHON_SETUP_LINT_DECISIONS_PATH test-only (honored ONLY under PYTEST_CURRENT_TEST; production root = config.cwd with traversal guard, no parent escape), lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic replace in target dir, prune automatic (missing files + stale model-ids, no --prune flag), --path scoping (unscanned retained), jobs==1 required else loud fail (no sidecars); observation producer owned atomically here (checker-layer file identity via node.root().file during refresh only; semantic_check stays path-free); normal lint read-only (hash-asserted zero writes); tach.toml gains decisions module + two edges (sole owner)."
      ],
      "scenarios": [
        "Scenario: Cache round-trips with cleanup and stays secrets-clean\n  Given empty/missing cache on tmp\n  When refresh runs with FakeBackend observations then prune\n  Then file round-trips sorted deterministically (double-run byte-identical), missing-file + stale-model entries disappear, live entries survive, detect-secrets passes, no bare hex>=20",
        "Scenario: Lint stays read-only while refresh writes explicitly\n  Given a committed cache with a persisted False verdict\n  When ordinary run_lint runs vs explicit --refresh-decisions\n  Then ordinary lint shows zero writes by byte-hash and emits the persisted verdict with no model load (heuristic-rejected never reaches backend; accepted+hit==persisted; accepted+miss+absent==heuristic True), while refresh merges + prunes + atomic-replaces, refuses under CI, and fails loudly on jobs>1"
      ]
    },
    {
      "id": "M4",
      "title": "CPU decision model wiring (spike-gated)",
      "directionalInterfaces": [
        "Semantic-on pin (tests-only, no model needed): deterministic fake-backend integration (SEMANTIC=1 + FakeBackend 0.0/1.0 over existing sample project, default-collected, no network) asserting veto extremes (1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend with call-count 0, one call per unique pair); exactly one slow+with_real_api e2e SKELETON (skipped until model ships; on go, wired to real backend with importorskip + CPU budget asserts).",
        "Backend wiring (branches on U1 verdict; consumes eval + runtime-pinning + cache-impl): GO maps to [semantic] extra gains pinned runtime only (CPU wheels linux/mac/win verified), get_backend() loads '<id> rev <short12> prompt-vN' via DECISION_MODEL (PROMPT_VERSION folded, GLIDE_MAX_BATCH=1 when caching), failure maps to None maps to heuristic with exactly-one warning (no retry storm), no_try_import patterns + tests updated deliberately, emptiness pins replaced with allowlist pins, uv.lock regenerated (base install stays light); NO-GO maps to zero prod writes, no-op attestation citing verdict section, heuristic-only preserved, docs state no-go (M5)."
      ],
      "scenarios": [
        "Scenario: Veto path pinned with and without a model\n  Given golden runs with SEMANTIC=0\n  When semantic-on pin merges\n  Then fake-backend integration passes deterministically in the default suite, the slow skeleton skips with a clear reason, and SEMANTIC=0 golden stays hash-equal",
        "Scenario: Model ships only on a compliant verdict\n  Given the U1 verdict (go with license+CPU+corpus gates or no-go/blocked)\n  When backend wiring merges\n  Then GO shows pinned runtime + loader + e2e pass (slow) with no default-suite network and no SEMANTIC=0 drift, or NO-GO shows zero prod diff with an attestation citing the verdict — never a silent swap or an unpinned dependency"
      ]
    },
    {
      "id": "M5",
      "title": "Pyi scope, docs/ADR reconciliation, and gate evidence",
      "directionalInterfaces": [
        "Pyi branch (consumes spike; strategy + shift report here, latent cleanup bounded): FIX maps to _PylintPyiLintTool lints companion stubs (temp-tree/copy or pylint mode that does not resolve companions, proven by broken-stub control), shift report {class, added/removed keys, CHANGELOG snippet, file:line}, latent stub cleanup EITHER in-budget (<=200 prod lines, same item) OR routed to I6 follow-ups with explicit file list (never baseline edits); ORPHAN-ONLY maps to zero prod writes, scope-note text (companion .pyi governed by mypy.stubtest only) for docs item, no golden change.",
        "Docs/ADR exact-strings (sole writer; after all behavior items): semantic-justification.md (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1, veto, FakeBackend, no reranker/sentence-transformers); custom-checks.md (DecisionBackend, live key tuple); troubleshooting.md (PYTHON_SETUP_LINT_DECISION_MODEL, PYTHON_SETUP_LINT_RERANKER_MODEL, deprecated, 9 pass/~57s); tutorials.md (decision backend, no rerunner); AGENTS.md (pipeline DecisionBackend with no reranker in subsection, Tool Scope 14 rows incl ruff format, Quick Commands recount at HEAD); README.md (v1.2.10, [semantic] runtime description); CHANGELOG.md ([semantic], go/no-go per verdict, 1.2.10, .python-setup-decisions.json); config/ty.toml grep-zero sentence_transformers (verify at HEAD); docs/adr/README.md indexes 013..024; ADR-014/016 rewritten to HEAD truth, ADR-009/002/011 staleness notes, ADR-019..024 full Context/Decision/Consequences.",
        "Regen + gate table: ONLY golden-regen-hatch writes tests/data/golden (PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally, never under CI, double-run byte-identical, key-by-key diff vs shift reports, golden + tool counts together; no-op attestation with hash equality if all no-shift); final gate table {format exit, lint 14/14 per-tool, pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist} with absolute green required (red routes to follow-ups, never baseline edits)."
      ],
      "scenarios": [
        "Scenario: Pyi scope closed without overstating enforcement\n  Given the spike verdict and golden impact count\n  When pyi branch merges\n  Then FIX shows strategy mechanism + shift report + (cleanup merged or I6 file list) with golden regen via hatch only, or ORPHAN-ONLY shows zero prod diff with scope-note text — and 'coding rules enforced' is not overstated either way",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When docs + hatch + gate table complete\n  Then docs grep per checklist, golden hash-equal or reviewed regen committed together, and the gate table records absolute green (format 0, lint zero new, pytest/integration per contract, baseline []); any red cell fails with routing to follow-ups"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "U1",
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect + single-author labels + Fastino review + no CPU bench all open; GLiDE-0.4B is smallest-in-family (0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17, glide/ vendored pkg) so 'or smaller' needs a different family; CC-BY-NC excluded per allowlist.",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder, report-only): license, params/size, runtime, py3.14 CPU wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "brush-off-corpus-pilot (fact-finder, report-only): two-pass blinded pilot N>=100 post-dedup, both strata non-empty, rubric + adjudication + agreement + splits, or explicit blocker; bias NOT fully repaired, human second rater still required for go/no-go",
        "model-eval-poc (poc, CPU-only, no committed files): ALL matrix candidates veto-only at 0.5/0.6/0.7 on deduped corpus; 90/95/85 compliance on heuristic-accepted stratum; cold-load/warm p50/p95 + RSS; GLIDE_MAX_BATCH=1 determinism; smallest compliant or no-go",
        "decision-runtime-pinning (test-assumptions, conditional on eval go): py3.14 CPU wheels + import/device/offline + custom-code pinning for chosen runtime; on no-go report-only skip, no file"
      ]
    },
    {
      "id": "U2",
      "description": "Whether pylint-pyi companion-stub skip is fixed (with latent stub cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden (42/43 on .py per old probe) and exposes large latent cleanup (205 symbols per old probe, verify at HEAD).",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan on tmp, recount golden impact + latent budget at HEAD, recommend fix-with-regen (with budget/regen plan) vs orphan-only (with scope-note text)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "cache-contract-assumptions",
      "kind": "test-assumptions",
      "title": "Pin tracked-cache file and refresh contracts",
      "description": "Tests-only, NEW tests/assumptions/test_decision_cache_contracts.py ONLY (append-only; FORBIDDEN root __init__ + astroid/beartype/pylint contracts + test_pylint_cache_semantics.py, src, docs, tests/data, baseline). Red-test-exempt (pins future contract; M3 consumes without loosening). pytestmark no_external_api, test_<api>_given_<condition>_then_<expected>, offline, tmp_path only. Pin ADR-019 shape: sorted indent=2/sort_keys round-trip; no bare hex>=20 + detect-secrets clean on tmp cache; read-only hash (byte-hash before/after ordinary run_lint on tmp project unchanged); refresh CI-guard refuses under CI/GITHUB_ACTIONS (golden-guard shape); prune missing-files + stale-model-ids; --path retains unscanned; jobs==1 required else loud fail (reuse writer-first verdict, cite file:line, do not re-derive). Verify: new tests pass; format-clean; no other files.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "backend-loading-assumptions",
      "kind": "test-assumptions",
      "title": "Pin backend loader gating and failure mapping",
      "description": "Tests-only, NEW tests/assumptions/test_decision_loader_contracts.py ONLY (same forbiddens as cache-contracts). Red-test-exempt. Pin at HEAD + M4 hook: PYTHON_SETUP_LINT_DECISION_BACKEND honored ONLY under PYTEST_CURRENT_TEST (both branches: honored with marker, ignored without — do not weaken _decision_backend.py:37-46); missing [semantic] extra / get_backend() None maps to check_if_meaningful heuristic bool (never raises, exactly-one structlog warning for DECISION_MODEL); PROMPT_VERSION folded into production model_id once wired (assert shape with prompt-vN suffix, FakeBackend already complies). Verify: new tests pass offline; format-clean.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "model-candidate-matrix",
      "kind": "fact-finder",
      "title": "Decision-model candidate matrix",
      "description": "Report-only, zero repo writes. Matrix for GLiDE-0.4B + permissively-licensed Decision-Index smalls + MiniLM baseline (recount families from I5 pack section 6 + live cards; verify each): license (exclude CC-BY-NC/non-commercial; flag Fastino Community + unclear/no-license for human review per allowlist), params/weights bytes, runtime stack, py3.14 CPU wheels linux/mac/win, custom-code/vendoring burden (never unpinned trust_remote_code), pinnable revision, offline behavior, CPU evidence (or explicit none). Cite card URLs + revision SHAs + license texts. Feeds eval-poc + runtime-pinning.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "brush-off-corpus-pilot",
      "kind": "fact-finder",
      "title": "Build two-pass brush-off pilot sample",
      "description": "Report-only, zero repo writes (no committed corpus in I5; poc consumes report tables). Collect N real repo suppressions + threshold 115-row table + brush-off/meaningful tables, DEDUPED by normalized justification (strip+collapse ws, keep case; target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both non-empty; report counts). Rubric: specific technical justification vs placeholder/deferral/brush-off (disclose edge-case rubric for terse borderlines). Rater protocol: pass-1 rates all; pass-2 re-rates blinded (shuffled, pass-1 hidden); disagreements resolved by documented adjudication rule (disclose rule); report inter-pass agreement + per-source/per-stratum split. Single-author bias NOT fully repaired — human second rater still required before any go/no-go (confirm-with-human). Or explicit blocker (collection/license/CPU) with I6 plan. No model choice here.",
      "milestoneId": "M1",
      "deps": [],
      "escalate": true,
      "prodBudgetHint": 0
    },
    {
      "slug": "model-eval-poc",
      "kind": "poc",
      "title": "CPU accuracy/latency evaluation (veto-only)",
      "description": "Prototype on tmp/venv only; zero committed files; network inside spike only. Consumes matrix + corpus reports (never invents candidates/labels). Mapping: justification=primary=(comment or text).strip(), rule=joined codes (current symbol where unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold; VETO-ONLY final=heuristic AND (prob>=threshold) per ADR-014 (replace mode rejected — do not score). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Score ALL matrix candidates at 0.5/0.6/0.7 (or explicit exclusion with reason): accuracy, meaningless-precision, meaningful-recall on heuristic-accepted stratum (overall also reported), CPU cold-load + warm p50/p95 + peak RSS, determinism check (GLIDE_MAX_BATCH=1 when caching; batching must not shift scores). Bars 90/95/85 apply to accepted stratum. Recommend smallest compliant model+prompt+threshold or no-go with evidence (license/CPU/accuracy blockers separated). Feeds runtime-pinning + M4 branch.",
      "milestoneId": "M1",
      "deps": [
        "model-candidate-matrix",
        "brush-off-corpus-pilot"
      ],
      "escalate": true,
      "prodBudgetHint": 0
    },
    {
      "slug": "decision-runtime-pinning",
      "kind": "test-assumptions",
      "title": "Pin chosen runtime wheels and API contracts",
      "description": "Conditional on eval verdict. GO maps to NEW tests/assumptions/test_decision_runtime_contracts.py ONLY (same forbiddens; no src changes): verify py3.14 CPU wheels linux/mac/win for chosen runtime, import/device/offline contract (CPU fallback, no network on cache-hit/memo-hit), custom-code pinning (vendored revision or PyPI pin, never unpinned trust_remote_code), loader/inference API signatures used by M4. NO-GO/BLOCKED maps to report-only skip, zero files, cite verdict section. Verify: new tests pass offline (or skip attested); format-clean.",
      "milestoneId": "M1",
      "deps": [
        "model-eval-poc"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "pylint-pyi-scope-spike",
      "kind": "fact-finder",
      "title": "Decide pylint-pyi companion-stub scope",
      "description": "Report-only, zero writes, tmp copies only. Reproduce at HEAD: tmp .pyi with companion .py (even syntactically broken — skipped?) vs orphan .pyi (linted, pyi-underscore fires?) with exact commands + outputs. Recount golden impact (pyi findings on .py vs .pyi) + latent budget (non-TYPE_CHECKING private symbols in src/**/*.pyi + duplicate-code findings on stubs) via grep at HEAD (old probe 42/43 and 205 symbols — verify, do not trust). Recommend fix-with-regen (mechanism: temp-tree/copy or pylint no-companion mode + cleanup budget + regen plan) vs document-orphan-only (scope-note text + stubtest governance). No prod change, no golden change here. Feeds M5 pyi-scope-fix.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "checker-harness-dedup",
      "kind": "story",
      "title": "Single-source checker-test harness",
      "description": "Owns src/python_setup_lint/testing.py (_make_tc/_walk_and_release options only) + tests/checkers/test_*.py local _make_tc/_walk_and_release/_msg_ids wrappers ONLY (enumerate via grep at HEAD: ~13/10/8 per pack, verify actual; report full list). FORBIDDEN docs, baseline, tests/data, runner tests, conftest fixtures. Red-test-exempt (behavior-preserving refactor). Extend shared helpers with backward-compat open_checker bool default False + module_name passthrough (SourceRootMixin callers pass True; preserve open vs no-open shapes); delete all local copies (grep zero defs in tests/checkers/test_*.py); migrate importers; touched files toward naming/marker conventions. First writer: semantic-test-doubles-dedup serializes after via dep. Verify: testing.py options + tests only; pytest -q + integration no new failures vs I5 HEAD (1357/9 per pack, recount); golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 30
    },
    {
      "slug": "semantic-test-doubles-dedup",
      "kind": "story",
      "title": "Single-source semantic test doubles and fixtures",
      "description": "Tests-only, second writer after harness-dedup. Owns tests/checkers/test_decision_backend.py + test_semantic_check.py + test_suppression_justification_checker.py + test_bare_except_comment_checker.py + tests/assumptions/test_pylint_cache_semantics.py + NEW tests/checkers/_decision_test_doubles.py (or testing.py extension — item reports placement + import graph; FORBIDDEN new conftest.py unless needed) ONLY. FORBIDDEN src, docs, baseline, tests/data, other test dirs. Red-test-exempt. Single-source 3x _RecordingBackend + 2x _semantic_disabled fixture into one home each; rewrite vestigial cache tests to live contracts (test_check_writes_no_disk_cache, semantic_disk fixture — assert absence of writes via hash/tmp, not raising=False on retired _CACHE_DIR/_RESULT_CACHE_FILE); preserve 115-row heuristic table + veto/threshold matrices byte-identical (outcomes pinned). Verify: tests only; no new failures; golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [
        "checker-harness-dedup"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "runner-test-helpers-dedup",
      "kind": "story",
      "title": "Single-source runner/setup helpers and prune dead tests",
      "description": "Tests-only. Owns tests/runner/_factories.py + _factories_extras.py + _factories_baseline.py + test_setup.py + test_setup_install.py + test_real_pipeline_smoke.py + tests/conftest.py (sample_project fixture lines only) ONLY. FORBIDDEN src, docs, baseline, tests/data, checker tests. Red-test-exempt. Single-source 2x _UvCallRecorder + 2x extra_block; delete dead helpers with grep-zero proof (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project — verify no call sites at HEAD, report each); smoke disposition: EITHER narrow to non-overlapping asserts (int return + markers that integration + fake orchestration do not already pin, with per-assert survivor analysis) OR delete with removal-to-survivor map to tests/integration.py + test_lint_runner_integration.py (never-test-linting boundary per 644774e precedent). Verify: tests only; no new failures; golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "source-simplifications",
      "kind": "story",
      "title": "Simplify semantic memo, heuristic sets, rcfile paths",
      "description": "Owns src/python_setup_lint/checkers/_semantic.py (memo only) + _base.py (boilerplate/phrase sets only) + runner/dispatch.py (pyi/tests rcfile blocks only) + checkers/__init__.py (docstring only) + .pyi fidelity rows for touched symbols ONLY. FORBIDDEN _decision_backend.py/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading (M3), testing.py (harness-dedup), no_try_import patterns (M4), tests/data, baseline, docs, tach.toml (M3). Behavior-preserving only (no threshold/key/behavior change): _semantic nullable memo + 2 globals maps to module dict + .clear() in _reset_cache; _base 46-token + 20-phrase sets maps to module-level frozensets (same literals, same membership); dispatch pyi/tests explicit-override-then-autodiscovery maps to shared _resolve_pylintrc path (same resolution order); checkers __init__ module docstring (runner/conformance pattern). Verify: prod <=40 lines; pytest + integration no new failures; lint 14/14 incl pylint/mypy/stubtest; golden hash-equal.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 40
    },
    {
      "slug": "decision-cache-impl",
      "kind": "story",
      "title": "Implement tracked decision cache and refresh",
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py + .pyi + __init__.py + tach.toml (sole owner: add decisions depends_on=[] + checkers/runner depends_on=[decisions]) + runner CLI threading (cli.py --refresh-decisions branch + help, types.py RunnerConfig.refresh_decisions bool False, _cli_complexity.py parse/build threading; --path reuses existing plumbing) + NEW tests/decisions/test_decision_cache.py + NEW tests/runner/test_refresh_decisions.py ONLY. FORBIDDEN _base/_semantic/_decision_backend (zero diff; observation via checker-layer file identity, not semantic API change), dispatch*/__init__/baseline/parsers (except CLI threading files), tests/data, baseline, docs, .gitignore/hatch/.secrets.baseline. Implements ADR-019: array sorted (rule, justification, model), indent2 sort_keys, entry + {version, prompt hash, last-seen}, score+decision, secrets-clean (no hex>=20); read-only lint (hash-asserted zero writes); explicit refresh (lockfile + merge + atomic replace in target dir, DECISIONS_PATH test-only under PYTEST_CURRENT_TEST, production root config.cwd with traversal guard, prune auto missing/stale, --path retains unscanned, jobs==1 else loud fail, CI-fail); observation producer ATOMICALLY here (refresh collects file via node.root().file + justification + rule + model + score during checker walk on refresh only — never prune-only; cite producer lines). Must pass all 14 tools incl tach + detect-secrets. Verify: tmp round-trip double-run byte-identical; zero-writes hash; refresh merges+prunes+sorts; CI-fail + isolation + jobs-guard tests; no new failures; golden hash-equal or shift-reported (expect no-shift: empty cache + no model maps to heuristic preserved).",
      "milestoneId": "M3",
      "deps": [
        "cache-contract-assumptions"
      ],
      "escalate": true,
      "prodBudgetHint": 200
    },
    {
      "slug": "semantic-on-golden-pin",
      "kind": "story",
      "title": "Pin semantic-on veto path with fake backend",
      "description": "Tests-only, no model needed. Owns NEW tests/test_semantic_on_veto.py (or tests/checkers/test_semantic_on_veto.py — item reports placement; verify no conftest cycle) ONLY. FORBIDDEN src, docs, tests/data/golden writes (hatch sole writer), baseline. Red-test-exempt (contract pin; veto already at HEAD so tests pass immediately). SEMANTIC=1 + FakeBackend(1.0/0.0) over existing sample project (no fixture change): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend (call-count 0 via _RecordingBackend), one call per unique pair (memo hit), cache-hit without model emits persisted verdict (tmp cache from M3); exactly one slow+with_real_api e2e SKELETON (skipped with reason 'no model wired' until M4 go; on go, model-backend-wiring wires it with importorskip + CPU budget). Modules <=500, no suppressions, never test linting. Verify: default suite passes (fake only, no network); skeleton skips; SEMANTIC=0 golden hash-equal.",
      "milestoneId": "M4",
      "deps": [
        "decision-cache-impl"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "model-backend-wiring",
      "kind": "story",
      "title": "Wire production decision backend (or no-go attestation)",
      "description": "Branches on U1 verdict (consumed, not advisory). GO (eval recommends compliant model + license allowlist pass + CPU bench pass + runtime-pinning merged): owns _decision_backend.py/.pyi (production loader only) + pyproject [semantic] block + uv.lock + no_try_import _OPTIONAL_IMPORT_PATTERNS + tests/checkers/test_decision_backend.py (packaging pins) + test_no_try_import_checker.py (patterns) + slow e2e skeleton wiring ONLY; FORBIDDEN _semantic/_base (zero diff; PROMPT_VERSION folded in loader model_id string, not adapter), decisions/, dispatch/CLI, tests/data, baseline, docs (snippet in report). Implement ADR-020: DECISION_MODEL '<id> rev <short12>' parsed, loader constructs backend with model_id '<id> rev <short12> prompt-vN', GLIDE_MAX_BATCH=1 when caching (if glide), failure maps to None maps to heuristic with exactly-one warning (no retry storm); replace emptiness pins with allowlist pins (chosen runtime only, base install stays light); wire slow e2e to real backend (importorskip, CPU budget asserts per eval). NO-GO/BLOCKED: zero prod writes, merge no-op attestation citing verdict section + blocker + I6 plan (heuristic-only preserved). Verify GO: slow e2e passes with model, default suite no network, SEMANTIC=0 golden hash-equal, lint 14/14, uv.lock resolves; NO-GO: attestation + zero-diff proof.",
      "milestoneId": "M4",
      "deps": [
        "model-eval-poc",
        "decision-runtime-pinning",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "semantic-test-doubles-dedup"
      ],
      "escalate": true,
      "prodBudgetHint": 80
    },
    {
      "slug": "pyi-scope-fix",
      "kind": "story",
      "title": "Fix or scope pylint-pyi companion stubs",
      "description": "Branches on pyi spike verdict. FIX-WITH-REGEN: owns _PylintPyiLintTool strategy (dispatch.py pyi block only, applied onto M2 deduped shape) + shift report ONLY; mechanism (temp-tree/copy or pylint no-companion mode) proven by broken-stub control (before: skipped, after: linted with pyi-underscore firing); latent stub cleanup EITHER in-budget here (<=200 prod lines across stubs, same item, with per-file counts) OR routed to I6 follow-ups with explicit file:line list (item reports which; never baseline edits); emits shift report {class, added/removed keys, CHANGELOG snippet, file:line} for hatch. ORPHAN-ONLY: zero prod writes, scope-note text for docs item (companion .pyi governed by mypy.stubtest only; pyi-underscore enforces orphan stubs), no golden change. FORBIDDEN tests/data (hatch sole writer), baseline, docs (text in report), other dispatch blocks. Verify FIX: control proves mechanism, no new failures except shift-reported pyi keys, golden regen via hatch only; ORPHAN: zero-diff proof.",
      "milestoneId": "M5",
      "deps": [
        "pylint-pyi-scope-spike",
        "source-simplifications"
      ],
      "escalate": true,
      "prodBudgetHint": 60
    },
    {
      "slug": "docs-adr-reconciliation",
      "kind": "story",
      "title": "Reconcile docs, ADRs, and version pins",
      "description": "Docs-only, sole writer in I5. Owns docs/semantic-justification.md + docs/custom-checks.md (semantic bullets only) + docs/troubleshooting.md (semantic section + counts) + docs/tutorials.md (semantic lines) + AGENTS.md + README.md + CHANGELOG.md + config/ty.toml (comment only, grep-zero sentence_transformers — verify at HEAD) + docs/adr/ADR-014.md + ADR-016.md (rewrite to HEAD truth) + ADR-009/002/011 (staleness notes) + docs/adr/README.md (index 013..024) + NEW ADR-019..024 (full Context/Decision/Consequences per plan) ONLY. FORBIDDEN src, tests, tests/data, baseline, tach.toml. Red-test-exempt. Counts from rerun actuals at HEAD (pytest --collect-only, TOOLS==14, integration 9-collected-0-failed with env pinned); exact-strings per M5 checklist (report grep proof per row); CHANGELOG user-visible (extra contents per M4 branch, new/deprecated vars incl full PYTHON_SETUP_LINT_DECISION_MODEL, cache file, go/no-go note, version 1.2.10); README v1.2.10 pin; AGENTS pipeline DecisionBackend with no reranker in subsection + Tool Scope 14 rows. Verify: docs-only diff; rumdl clean; no new failures; golden hash-equal (no behavior change).",
      "milestoneId": "M5",
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "golden-regen-hatch",
      "kind": "story",
      "title": "Conditional golden regen on shift reports",
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items (cache-impl, backend-wiring, pyi-fix; source-simplifications + golden-pin declare no-shift): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (tests/_golden.py:53; never under CI/GITHUB_ACTIONS — guard fails), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "milestoneId": "M5",
      "deps": [
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "final-gate-validation",
      "kind": "fact-finder",
      "title": "Final gate table and docs check",
      "description": "Report-only, zero writes. Record final gate table at HEAD: format exit 0 (ruff format --check --config config/ruff.toml src tests); lint 14/14 per-tool (uv run lint; cite exit + per-tool PASSED + duration); pytest -q counts (pass/deselect/warnings, cite); integration 9-collected-0-failed with pre-commit env pinned (cite env + 9 passed); golden hash or regen diff (cite hatch report); baseline []; docs exact-strings per M5 checklist (cite grep proof per row from docs item). Absolute green required here (M5 only); red cells fail with routing to I6 follow-ups (new root items by file owner), never baseline edits. Feeds close-up.",
      "milestoneId": "M5",
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix",
        "docs-adr-reconciliation",
        "golden-regen-hatch"
      ],
      "prodBudgetHint": 0
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material pre-ship (dormant FakeBackend path). Tightening intentional when a compliant model ships with shift report + CHANGELOG + hatch regen.",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract; operator acknowledged tightening intentional, not a regression.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits (+ FakeBackend in tests). Real-model tests are slow + with_real_api (+ importorskip), never in default suite.",
      "why": "Matches current venv (I5 pack: extra empty, no torch); keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained; smoke disposition follows 644774e prune precedent.",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting the fit-for-purpose contract.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it per I5 pack 56.6s; 7 passed + 2 skipped without per skip logic). AGENTS.md reconciled to recount at HEAD.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
    },
    {
      "assumption": "Gates green at I5 HEAD per pack (1357 passed / 9 passed / 14-tool lint exit 0 at 0944670); the 2026-11-07 infra baseline (red lint/test, ruff-format mutation) is superseded by I2/I4 fixes; items verify no-new-failures vs I5 HEAD recount, not vs stale infra baseline.",
      "why": "Avoids re-litigating fixed reds; closeup-4 + I5 pack prove green at HEAD."
    },
    {
      "assumption": "No child epics in I5; all work as 18 root items within the 50-item cap, file-level single-writer + dep serialization (ADR-023 extends ADR-013).",
      "why": "I3 epic gate caused 3 empty waves + zero delivery; I4 root-serialized delivery unblocked M2 verified + M3/M4 partials."
    },
    {
      "assumption": "Model license allowlist: Apache-2.0 / MIT / BSD-2/3-Clause allowed; CC-BY-NC-4.0 and other non-commercial excluded; Fastino Community + unclear/no-license flagged for human review; no model ships without a license verdict + human approval if Fastino recommended.",
      "why": "MIT tool cannot absorb non-commercial/unclear licensing; I5 bake-off needs the gating criterion before any verdict.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Iteration 5 may close infra-only again if U1 verdict is no-go/blocked (model swap NOT complete, must not be claimed). I6 triggers: double-rated corpus with independent second rater, human Fastino decision if GLiDE recommended, CPU bench pass.",
      "why": "ADR-009 no-go gating extended by ADR-020; operator must approve infra-only close-up if gates fail again.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Cache file location/name is .python-setup-decisions.json at the linted project root (next to lint.baseline), committed, no hatch entry, secrets-clean; weights in user model cache, never git.",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model; committed file affects gitignore/hatch/consumers/secrets; operator acknowledged root placement in I1.",
      "disposition": "confirm with human"
    }
  ],
  "techDebt": [
    {
      "id": "TD5-B1",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "category": "blocking",
      "resolution": "U1 spikes + M4 branch (go only on license+CPU+corpus gates with human approval; else no-op attestation + heuristic-only docs); backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "id": "TD5-B2",
      "description": "I4 cache producer gap (awareness: refresh prune-only until producer; decisions/ missing at HEAD so gap is unmerged, not live).",
      "category": "blocking",
      "resolution": "ADR-019 + decision-cache-impl owns storage + observation producer atomically (checker-layer file identity during refresh only); M3 acceptance requires end-to-end population proof on tmp (not prune-only); no split."
    },
    {
      "id": "TD5-I1",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, latent private stub symbols, companion stubs unenforced per old probe).",
      "category": "impacting",
      "resolution": "pyi-scope-spike recounts at HEAD + recommends; M5 pyi-scope-fix branches fix-with-regen (strategy + bounded cleanup + hatch regen) vs orphan-only doc note; over-budget cleanup routes to I6 follow-ups; golden unchanged unless fix merges via hatch."
    },
    {
      "id": "TD5-I2",
      "description": "Semantic-on behavior unpinned (golden + integration capture with SEMANTIC=0; model could change W9704/W9738 silently).",
      "category": "impacting",
      "resolution": "semantic-on-golden-pin adds deterministic fake-backend integration (default suite) + slow skeleton (skipped until model); M4 wiring asserts no SEMANTIC=0 drift; golden stays SEMANTIC=0 per ADR-021."
    },
    {
      "id": "TD5-A1",
      "description": "Docs/ADR drift (semantic-justification, custom-checks, troubleshooting, tutorials, AGENTS.md counts/scope/pipeline, README, CHANGELOG, ty.toml, ADR-002/009/011/014/016 staleness, ADR index omits 013..016).",
      "category": "adjacent",
      "resolution": "docs-adr-reconciliation sole writer with exact-strings checklist; ADRs 019..024 formalize I5 decisions."
    },
    {
      "id": "TD5-A2",
      "description": "Test-harness duplication + dead code (13 _make_tc, 10 _walk_and_release, 8 _msg_ids, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, 2 _semantic_disabled, dead helpers, vestigial cache tests, smoke overlap) + source placeholders (globals, per-call sets, rcfile dup, missing docstring).",
      "category": "adjacent",
      "resolution": "M2 items single-source/delete/simplify with grep-zero proofs + survivor maps; behavior identical."
    },
    {
      "id": "TD5-A3",
      "description": "Pre-existing tracked junk file ':bash' reported in I4 wave 6 (verify at HEAD via git ls-files) + minor version drift (pyproject 1.2.10 vs CHANGELOG v1.2.9).",
      "category": "adjacent",
      "resolution": "Operator deletes ':bash' outside iteration (no item owns root junk; final-gate-validation reports presence); docs item pins versions."
    },
    {
      "id": "TD5-A4",
      "description": "Legacy .gitignore .cache/python-setup/semantic/ lines (retired machine cache) alongside new root decisions file.",
      "category": "adjacent",
      "resolution": "Retained intentionally (.cache still ignored; root decisions file committed; no hatch entry); cache-impl forbids .gitignore changes."
    }
  ],
  "adrs": [
    {
      "id": "ADR-019",
      "title": "Tracked-cache keying, file identity, and refresh contract (I5)",
      "context": "ADR-010 freezes backend + tracked-cache contracts but leaves file-identity vs path-free API, key composition, score vs verdict, refresh shape, CI direction, isolation scope, sort key, prune policy, --path scoping, jobs>1 behavior unspecified (I5 pack Q3). semantic_check is deliberately path-free (test_pylint_cache_semantics.py:171-181) and callers pass no paths; memo key includes code_context + 64-bit truncation; no CLI surface exists; secrets baseline enables HexHighEntropyString; writer-first verdict pins jobs=1 sequential. I4 ADR-017/018 planned lint-flag refresh + decisions-module placement but never merged (files missing at HEAD).",
      "decision": "Re-affirm ADR-017/018 shape with I5 resolutions: (1) semantic_check stays path-free; file identity supplied at checker layer via observation producer during refresh only (node.root().file into decisions API; normal lint path unchanged, zero _base/_semantic diff for identity). (2) Tracked key is (justification normalized [strip+collapse ws, keep case], rule joined codes, model '<id> rev <short12> prompt-vN'); context is model input only, NOT in key. (3) Store score float [0,1] + decision bool (re-thresholdable without re-running model; protocol range enforced by loader clamp + test). (4) Refresh is lint --refresh-decisions [--path ...] (setup-subcommand rejected); FAILS under CI/GITHUB_ACTIONS (golden-guard shape); DECISIONS_PATH test-only under PYTEST_CURRENT_TEST only; production root config.cwd with traversal guard (no parent escape/absolute outside); array sorted (rule, justification, model), indent=2 sort_keys; files sorted unique POSIX, union-merged; prune automatic missing/stale (no --prune flag); --path retains unscanned; jobs==1 required else loud fail (no sidecars). (5) Placement python_setup_lint/decisions/_decision_cache.py + .pyi; checkers/runner depends_on=[decisions]; decisions depends_on=[]; cache-impl sole tach.toml owner. (6) No .gitignore change (root file committed), no hatch entry (consumer-runtime data), no bare hex>=20 (secrets-clean).",
      "consequences": "Single refresh contract for M1 assumptions + M3 impl; implementation owns storage + producer atomically (no prune-only gap); normal lint read-only provable by hash; deterministic serialization provable by sort key; secrets + tach scans clean; M3 tests assert all branches on tmp."
    },
    {
      "id": "ADR-020",
      "title": "Model gating and default-off wiring for I5",
      "context": "Intent names GLiDE-0.4B or smaller; GLiDE is 0.4B/0.81GB bf16/CUDA-tested/torch 2.14/transformers 5.17/glide-vendored/Fastino Community License (commercial revenue gate + attribution + copyleft derivatives) vs MIT project; smallest-in-family so 'or smaller' needs a different family; ADR-009 corpus gate untouched (215/0 single-author, no corpus artifacts, no CPU bench); get_backend has no production path (DECISION_MODEL warn-only, PROMPT_VERSION dead); veto semantics mean default-on tightens W9704/W9738 for every consumer installing the extra.",
      "decision": "Gate wiring on U1 verdict with allowlist (Apache-2.0/MIT/BSD allowed; CC-BY-NC excluded; Fastino/unclear flagged for human review; no ship without license verdict + human approval if Fastino recommended) + CPU bench (cold-load/warm p50/p95 + RSS on target class, GLIDE_MAX_BATCH=1 determinism when caching) + corpus pilot (N>=100 post-dedup, both strata, rubric + two-pass blinded + adjudication + agreement; human second rater still required for go/no-go). Veto-only evaluation at 0.5/0.6/0.7; bars 90/95/85 on heuristic-accepted stratum; smallest compliant or no-go. Wiring (on go only): [semantic] gains pinned runtime (CPU wheels, base stays light), loader via DECISION_MODEL with PROMPT_VERSION folded, failure maps to None maps to heuristic with exactly-one warning (no retry storm), no_try_import + emptiness pins updated deliberately, uv.lock regenerated. Default heuristic-only until M4 go merges; semantic-on pinned by M4 fake-backend integration regardless. On no-go/blocked: zero prod writes, no-op attestation, heuristic-only docs.",
      "consequences": "No silent swap; gates stay offline/fast/deterministic; packaging change only on compliant verdict; close-up must not claim swap complete on no-go; I6 triggers explicit (independent rater, Fastino decision, CPU bench)."
    },
    {
      "id": "ADR-021",
      "title": "Semantic-on behavior pinning",
      "context": "Golden + integration capture with SEMANTIC=0 (tests/integration.py:110-115; tests/_golden.py:54), so model-enabled W9704/W9738 outcomes unpinned; a model could pass the suite while changing consumer behavior; veto extremes (Fake 1.0 preserves, 0.0 vetoes) deterministic without network.",
      "decision": "Pin veto path with (1) deterministic fake-backend integration (SEMANTIC=1 + FakeBackend 0.0/1.0 over existing sample, default-collected, no network, no fixture change): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend (call-count 0), one call per unique pair (memo hit), cache-hit without model emits persisted verdict; (2) exactly one slow+with_real_api e2e SKELETON (skipped 'no model wired' until go; on go wired with importorskip + CPU budgets). Golden stays SEMANTIC=0 (heuristic contract); semantic-on contract lives in new tests, not the golden file.",
      "consequences": "Veto tightening visible before any model ships; no golden churn for semantic-on; real-model coverage gated behind slow + importorskip; M4 wiring asserts no SEMANTIC=0 drift."
    },
    {
      "id": "ADR-022",
      "title": "Test-harness single-sourcing and debloat acceptance",
      "context": "Measured duplication at HEAD (13 _make_tc, 10 _walk_and_release, 8 _msg_ids with open()/module_name variance; 3 _RecordingBackend; 2 _UvCallRecorder; 2 extra_block; 2 _semantic_disabled; dead helpers; vestigial raising=False cache tests; smoke overlapping integration + fake orchestration) vs behavior contracts (115-row heuristic table, W9704/W9738 checker tests, golden 158). 'Never test linting' defined only by 644774e prune precedent. No line-reduction metric beyond C0302/R0912/R0915 + empty baseline.",
      "decision": "Single-source harness helpers with variance-preserving options (testing.py open_checker/module_name with backward-compat defaults; one home per double/fixture with reported placement + import graph); delete dead helpers only with grep-zero no-call-site proof; rewrite (not loosen) vestigial cache tests to live hash/tmp contracts; smoke kept-narrowed (non-overlapping asserts with per-assert survivor analysis) or deleted with removal-to-survivor map to integration + fake orchestration; 115-row table + checker behavior + golden preserved byte-identical; touched modules <=500, no new suppressions, toward naming/marker conventions. Acceptance is grep-zero + no-new-failures + golden hash-equal, not line-count delta.",
      "consequences": "Debloat without intent loss; no gate-duplicating tests reintroduced; future harness changes have single homes; QA verifies by grep + gates, not LOC."
    },
    {
      "id": "ADR-023",
      "title": "Root-serialized delivery continued for I5",
      "context": "I3 epic gate stalled (retry + 3 empty waves, Blocked none, M2 zero delivery per closeup-3); I4 ADR-013 abandoned epics for root items with file-level single-writer + dep serialization, unblocking M2 verified + M3/M4 partials; I4 closeup shows 2 running + 3 pending carried by file ownership, not epic close-ups; review requires file-level proof for parallel items.",
      "decision": "I5 ships no child epics; all work as 18 root items with file-level single-writer for parallel items plus dep serialization for handoffs (harness-dedup into semantic-doubles; matrix+corpus into eval into runtime-pinning; cache-contracts into cache-impl into golden-pin into backend-wiring; pyi-spike + source-simplifications into pyi-fix; all behavior + debloat into docs; all behavior into hatch into gate table). No replanAfter gates; spike verdicts consumed via deps with pre-planned go/no-go and fix/orphan branches (no-op attestations on blocked, never invented alternatives). I6 may reintroduce epics or continue root increments.",
      "consequences": "9 dep-free wave-1 items avoid empty waves; no epic close-up/handoff bottleneck; M5 hatch consumes item shift declarations directly; parallel same-file forbidden, sequential same-file only via explicit deps."
    },
    {
      "id": "ADR-024",
      "title": "Pylint-pyi scope resolution process",
      "context": "ADR-015 defers fix to I5; _PylintPyiLintTool passes .pyi paths but pylint lints companion .py (42/43 golden on .py per old probe); 205 latent private stub symbols; fixing changes golden + exposes cleanup, conflicting with preservation unless staged via hatch; strategy fix vs scope note still unknown at plan time.",
      "decision": "Resolve by spike then branch: M1 pyi-scope-spike reproduces companion-vs-orphan on tmp + recounts golden impact + latent budget at HEAD + recommends fix-with-regen (mechanism + cleanup budget + regen plan) vs orphan-only (scope-note text). M5 pyi-scope-fix consumes verdict: FIX implements strategy mechanism (proven by broken-stub control) + shift report + in-budget cleanup (<=200 prod lines) or I6 file-list routing (never baseline edits), golden via hatch only; ORPHAN-ONLY merges zero prod diff with scope-note text for docs (companion .pyi governed by mypy.stubtest). 'Coding rules enforced' not overstated either way.",
      "consequences": "Golden stable unless fix merges via hatch; latent cleanup budgeted explicitly; I6 follow-ups concrete if over-budget; docs state scope truthfully."
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
  "maxEmptyWaves": 3,
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
