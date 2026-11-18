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
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "Validated unified map: owner enum {runner,checkers,setup-testing,semantic,root}; ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/**; root-owned group (tests/data, config, docs, repo-root files, epics read-only); symbol-exclusion column; planned-path reservations; drift list for stale evidence lines. Artifact = item-report tables (durable orchestration records).",
        ".secrets.baseline filters_used gains {path: detect_secrets.filters.regex.should_exclude_file, pattern: [^\\.factory/]}; journals stay committed; M1 acceptance cites mechanism + pinned HEAD, not finding counts.",
        "Pylint writer-first verdict (writer + timing + --path scoping) readable from tests/assumptions/test_pylint_cache_semantics.py report; cache-design-spike input satisfied."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Ownership map validated\n  Given iteration-2 audit reports plus HEAD\n  When ownership-map-revalidation re-globs\n  Then every universe file validates against exactly one owner (counts confirmed modulo HEAD drift), exclusions reference existing symbols, reservations name only planned paths, and stale rows are listed with corrected evidence",
        "Scenario: Secrets gate green by mechanism\n  Given the .factory/ exclusion merged\n  When detect-secrets scans git ls-files on a clean checkout\n  Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only",
        "Scenario: Epic kickoff unblocked\n  Given the validated map, pylint verdict, and exclusion\n  When epic-kickoff-gate completes\n  Then all three epics have dispute-free file/symbol ownership and proceed; any dispute is resolved by amended assignment"
      ],
      "title": "Validated decomposition and green-gate preconditions"
    },
    {
      "directionalInterfaces": [
        "Epic runner: dispatch.py split keeps EXPECTED_TOOL_NAMES deriving from TOOLS; registry re-exports single-sourced; compat shims deleted (or kept with evidence); test removals each name a survivor.",
        "Epic checkers: _base.py shared stream helper + typed register(); _legacy_scan renamed; _factories.py split by checker group; semantic symbols untouched; W9704/W9738 SEMANTIC=0 behavior pinned.",
        "Epic semantic: DecisionBackend Protocol + DECISION_THRESHOLD + PROMPT_VERSION; .python-setup-decisions.json schema (sorted, secrets-clean, read-only lint, explicit refresh); FakeBackend/NoBackend; [semantic] extra without sentence-transformers; merged heuristic table."
      ],
      "id": "M2",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Runner modernized without behavior drift\n  Given the runner epic scope\n  When its items merge\n  Then zero complexity suppressions remain in runner/**, golden stays byte-identical (or shift-reported), and all gates pass",
        "Scenario: Checkers modernized without behavior drift\n  Given the checkers epic scope\n  When its items merge\n  Then structural duplication is eliminated via shared helpers, semantic symbols are untouched, and heuristic outcomes are pinned or shift-reported",
        "Scenario: Semantic infrastructure ready for a future model\n  Given the no-go verdict\n  When the semantic epic merges\n  Then backend/cache/refresh/decision contracts work against FakeBackend + tracked cache with deterministic tests, docs describe the no-go status, and no model ships"
      ],
      "title": "Subsystem modernization via three epics"
    },
    {
      "directionalInterfaces": [
        "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against the shift report; golden + tool counts committed together.",
        "Final gate table: format exit code; lint per-tool results on scoped checkout; pytest counts (pass/skip/deselect); integration 9/9; golden hash equality or regen diff; lint.baseline []; docs reconciliation checklist (AGENTS.md:9-11 counts, Tool Scope ruff-format row, CHANGELOG version, README pin, ADR staleness notes)."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given epic shift reports (or none)\n  When golden-regen-hatch runs\n  Then golden is byte-identical, or regenerated with a reviewed key-by-key diff matching the shift report; no blind regen ever occurs",
        "Scenario: Iteration closes with evidence\n  Given all epic merges\n  When final-gate-validation completes\n  Then the gate table, golden status, baseline status, and docs checklist are recorded for close-up; any red cell routes back to an epic item, never to a baseline edit"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Audit evidence may have drifted since iteration 2 (file:line moves, renames, merged items). Epic scopes built on stale rows would misfire.",
      "id": "U1",
      "spikeOutlines": [
        "ownership-map-revalidation (fact-finder, zero writes): re-glob HEAD, confirm 5-owner counts + exclusions + reservations, emit drift list"
      ]
    },
    {
      "description": "Whether any compliant decision model exists is unknown: corpus-construction defect (accepted stratum 215/0) blocks the 95% precision bar; GLiDE needs Fastino license review; no CPU benchmark exists for any candidate.",
      "id": "U2",
      "spikeOutlines": [
        "deferred follow-up (outside iteration 3): double-rated real brush-off sample + license decision; iteration-3 builds backend/cache against FakeBackend (ADR-009)"
      ]
    },
    {
      "description": "Cache concurrency semantics (writer identity/timing, --path scoping) depend on the pylint verdict file, which may still be unmerged.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-cache-semantics-closure (test-assumptions): land or verify the single verdict file; epic consumes it, never invents"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for the ownership universe (src+scripts+tests minus tests/data), confirm unified 5-owner counts (expect 67/83/15/4/15 modulo iteration-3 HEAD drift), symbol exclusions (_semantic.py+.pyi, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, semantic test modules + TestSuppressionRerankerPipeline), planned-path reservations, and root-owned group (tests/data, config, docs). Read the merged coding-rules + test-debloat audit reports; flag any row whose evidence (file:line) no longer matches HEAD. Output: validated map + drift list consumed by all three epics. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "ownership-map-revalidation",
      "title": "Re-validate unified ownership map at HEAD"
    },
    {
      "deps": [],
      "description": "Land the operator-approved exclusion so the lint gate is green on clean checkouts: insert {\"path\": \"detect_secrets.filters.regex.should_exclude_file\", \"pattern\": [\"^\\\\.factory/\"]} into .secrets.baseline filters_used (after ~line 40), keeping journals committed. Verify: full git-ls-files detect-secrets scan exits 0 on clean checkout while a planted control secret still exits 1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk caveat (write-time redaction + periodic unfiltered audits). No other baseline edits.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-baseline-exclusion",
      "title": "Add .factory/ exclusion to .secrets.baseline"
    },
    {
      "deps": [],
      "description": "Close the iteration-2 M3 gap if still unmerged at iteration-3 start: EXACTLY ONE new file tests/assumptions/test_pylint_cache_semantics.py (no_external_api, test_<api>_given_<condition>_then_<expected>, offline, no src writes). Writer-first: writer + timing + --path scoping verdict (crash-safe lock vs runner post-merge vs jobs=1/sidecars-if--j). If the iteration-2 item already merged, this item verifies the verdict exists and is readable; otherwise it lands the file. Verdict feeds epic-semantic-infrastructure cache concurrency (epic must not invent semantics).",
      "kind": "test-assumptions",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "pylint-cache-semantics-closure",
      "title": "Land or verify pylint writer/timing verdict"
    },
    {
      "deps": [
        "ownership-map-revalidation",
        "pylint-cache-semantics-closure",
        "secrets-baseline-exclusion"
      ],
      "description": "Root-owned coordination checkpoint (report-only): confirm the three epics consumed the validated map + drift list, the pylint verdict is readable, and .secrets.baseline exclusion is merged. Resolve any ownership dispute (file claimed by two epics, reservation collision, stale evidence line) by amended assignment before epic waves scale. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "epic-kickoff-gate",
      "title": "Epic kickoff and ownership-dispute gate"
    },
    {
      "deps": [
        "epic-kickoff-gate"
      ],
      "description": "Root-owned regen hatch, executed ONLY on a reviewed shift report from an epic (heuristic outcome change, e.g. real suppressed codes): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), verify byte-identical double run, review the added/removed diff key-by-key against the shift report's justification-class description, commit golden + tool counts together. If no epic emits a shift report, this item is a no-op verification (golden byte-identical). NEVER blind-regen.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on reviewed shift report"
    },
    {
      "deps": [
        "golden-regen-hatch"
      ],
      "description": "Root-owned final validation: format gate exit 0; lint gate green (scoped clean checkout for detect-secrets MemoryError; cite mechanism + HEAD); `pytest -q` green (count + skips recorded); integration 9/9; golden byte-identical or regen-with-reviewed-diff; lint.baseline []; docs reconciliation verified (AGENTS.md counts/scope rows, CHANGELOG version, README pin, ADR staleness notes per audit assignment). Record final gate table for close-up. Zero repo writes except none — fixes go back to epic items.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs reconciliation check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden 158 findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections are material; model accept/reject was never material (dormant path). Tightening remains intentional when a model eventually ships.",
      "disposition": "confirm with human",
      "why": "Preserves the iteration-1/2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Iteration-2 spike reports (candidate matrix, CPU eval no-go, runtime-pinning skip, pylint writer verdict if merged, coding-rules + test-debloat audits) are durable and readable at replan per ADR-008; validation re-globs HEAD.",
      "why": "Plan-2 ADR-008 durability decision; verified pattern for both audits."
    },
    {
      "assumption": "Dev/CI do not install the `semantic` extra; gates run heuristic + cache hits. Any real-model test is slow + with_real_api, never in the default suite.",
      "why": "Matches current venv and keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts are retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in iteration 1; removes gate-duplicating tests without deleting the fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental (worktree state), not a product violation; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator's secrets answers stand: journals stay committed; ^\\.factory/ filter lands in .secrets.baseline filters_used (task-branch commit); harness filter-seeding is a follow-up outside this task.",
      "why": "Steering directive 1794158471467; M1 acceptance cites mechanism + pinned HEAD."
    }
  ],
  "epics": [
    {
      "intent": "# epic-runner-modernize\n\nChild epic of `modernize`. Own per unified map: runner/** (src + tests + stubs) plus root-group follow-ups assigned at re-glob (e.g. AGENTS.md count/scope rows, CHANGELOG version line) if still stale. Out of scope: checkers/**, semantic symbols, tests/data/** (read golden for verification only; NEVER write — regen is a root item), tests/checkers/**.\n\n## Requirements\n1. CodingRules enforcement on runner/**: remove all complexity suppressions by refactoring (dispatch.py 542-line disable -> split registry/strategies/parsers-sets into modules each <=500 with single-source re-exports; no threshold raises). Delete dead compat (baseline.py peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting tests) unless external-consumer evidence is found in-repo (then record and keep). Remove redundant wrappers/fallbacks per audit rows.\n2. Test debloat per test-debloat-audit rows: merge overlapping baseline-diff/runner-stats/t3 parser-completeness coverage (exact duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting groups owned by runner (self-lint, config-consistency, noise-filter, private-imports scan, hardcoded-checkout live test) mapping each intent to golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename milestone-ID test files by behavior (keep class/function contract names where gates reference them).\n3. Keep test intent: every removal/merge names its survivor (golden scenario, assumption test, or retained unit test); default suite keeps a full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected survivor named).\n4. Contracts: golden 158 findings + tool counts byte-identical unless a reviewed regen is requested via shift report (root regenerates); lint.baseline stays []; AGENTS.md count rows updated only if assigned at re-glob (root owns otherwise).\n\n## Acceptance\n- runner/** has zero too-many-lines/complexity suppressions; all modules <=500 lines; dispatch registry still single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).\n- Compat shims deleted (or kept with in-repo consumer evidence + debt note).\n- Removed tests each map to a survivor; blocking-debt limbs from the audit either pinned by new tests or explicitly flagged.\n- Gates: format, lint (scoped clean checkout for detect-secrets), `pytest -q`, integration all green; golden byte-identical.",
      "slug": "epic-runner-modernize"
    },
    {
      "intent": "# epic-checkers-modernize\n\nChild epic of `modernize`. Own per unified map: checkers/** (src + tests + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch): checkers/_semantic.py+.pyi, _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS, tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline. Planned-path reservations for semantic modules are read-only. Out of scope: runner/**, tests/data/** (read-only), other test dirs.\n\n## Requirements\n1. CodingRules enforcement on checkers/**: shared stream read/decode helper in _base.py (remove ~15 copied blocks), typed register() (remove structural missing-beartype/type-ignore[misc] suppressions), rename _legacy_scan (it is the only scan path), remove dead _legacy_* exemptions in trivial_wrapper_checker, split or slim over-limit modules (never raise thresholds), fix .pyi fidelity/private-symbol rows from the audit.\n2. Test debloat per test-debloat-audit rows: split tests/checkers/_factories.py (1,393 lines) by checker group with ParameterSet typing and cases next to tests; inline the 10 local _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers; remove unused factory helpers; fix test naming toward test_<method>_given_<condition>_then_<expected> for touched files; remove never-testing-linting checker tests only if the audit lists them (with survivors).\n3. Semantic-adjacent fixes WITHOUT touching excluded symbols: W9704/W9738 callers may pass real suppressed codes (joined sorted string) only if the audit + golden impact is reviewed — if any heuristic outcome shifts, emit shift report + CHANGELOG behavior description and STOP (root regenerates golden); never edit check_if_meaningful itself.\n4. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled corpora; lint.baseline stays [].\n\n## Acceptance\n- Zero structural suppressions removable by the shared helper/typed register; no over-limit checker module with a disable.\n- _factories.py split with no behavior change; local helper duplicates eliminated.\n- All 40 heuristic W9704 + 11 W9738 tests pass unchanged (or with reviewed shift report + root regen).\n- Gates: format, lint (scoped), `pytest -q`, integration green; golden byte-identical or root-regenerated with reviewed diff.",
      "slug": "epic-checkers-modernize"
    },
    {
      "intent": "# epic-semantic-infrastructure\n\nChild epic of `modernize`. Implement the model-INDEPENDENT semantic infrastructure now; model wiring waits on the corpus-repair + license verdicts (ADR-009). Owned symbols/files: checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype, structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in checkers/_base.py+.pyi (heuristic-first gate + backend injection ONLY); _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py (new runtime patterns); pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion for tracked cache; docs (semantic-justification.md rewrite, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section ONLY on post-M1 HEAD, CHANGELOG user-visible); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py, new runtime-assumption modules under tests/assumptions/ (append-only; never touch root __init__ + 3 contract modules).\n\nProtocol with root: NEVER write tests/data/** (read golden for verification only); on heuristic shift emit shift report + CHANGELOG behavior description (root regenerates). No edits to tests/integration.py, tests/conftest.py. Runner touch minimal + ADR or not at all.\n\n## Requirements\n1. Contracts (ADR-010): keep check_if_meaningful signature + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate (rejections never reach backend). semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n2. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model), secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh only (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to linted files; drop empty-files + stale-model. Concurrency per pylint writer-first verdict (read the merged verdict; if pylint-cache-assumptions unmerged, root item lands first — do not invent semantics). Must pass all tools incl. detect-secrets.\n3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but with no compliant model available the loader returns None (one warning, sentinel, heuristic stands). sentence-transformers dropped from [semantic]; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Real suppressed codes: extract all codes, normalize/sort/join ',' as rule (bare-except keeps single symbol); rule-echo rejects on any element. On shift: shift report + CHANGELOG, root regenerates.\n4. Tests: merge brush-off/meaningful/threshold tables into one deduped parametrized table (heuristic outcomes pinned); FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; delete vacuous `is None or ...` + ImportError-propagation test; mark the 4 pair tests slow (or delete with the reranker); fix SEMANTIC isolation (checker tests set SEMANTIC=0 where heuristic-pinned); modules <=500, no suppressions; never test linting. Exactly one slow+with_real_api e2e SKELETON (skipped until a model ships) is allowed, not required.\n5. Docs: rewrite semantic-justification.md (heuristic-gated backend + tracked cache + no-go status), custom-checks bullet, troubleshooting section, AGENTS.md pipeline section only, CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches backend; one call per unique pair; scoped cleanup; no retry storm.\n- Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled comments (or shift report + root regen).\n- Gates: format, lint (scoped), `pytest -q`, integration green with empty baseline.",
      "slug": "epic-semantic-infrastructure"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "Iteration-2 eval structural no-go: contracted accepted stratum 215/0 makes 95% meaningless-precision unevaluable; all 183 repo labels single-author with terse borderlines all True. No model meets the bar by construction.",
      "id": "TD3-B1",
      "resolution": "ADR-009: no model ships in iteration 3. Follow-up (outside this iteration): double-rated real brush-off sample repairing corpus construction + human Fastino license decision; epic-semantic-infrastructure builds backend/cache against FakeBackend so a compliant model plugs in via get_backend()."
    },
    {
      "category": "blocking",
      "description": "M4 audit report completeness + unified-map drift: reports live in orchestration records; evidence lines may be stale at iteration-3 HEAD.",
      "id": "TD3-B2",
      "resolution": "ownership-map-revalidation re-globs HEAD and produces the validated map + drift list; epic-kickoff-gate resolves disputes before epic waves scale."
    },
    {
      "category": "impacting",
      "description": "Pylint writer/timing verdict may still be unmerged (iteration-2 pylint-cache-assumptions running at close-up); cache concurrency design cannot be invented.",
      "id": "TD3-I1",
      "resolution": "pylint-cache-semantics-closure lands or verifies the single verdict file first; epic-semantic-infrastructure consumes it and must not invent lock/merge semantics."
    },
    {
      "category": "impacting",
      "description": "detect-secrets gate red on factory journals (environmental) + MemoryError on huge tracked artifacts in dirty worktrees.",
      "id": "TD3-I2",
      "resolution": "secrets-baseline-exclusion lands the approved ^\\.factory/ filter (journals stay committed); final validation runs on scoped/clean checkout and cites mechanism + HEAD."
    },
    {
      "category": "adjacent",
      "description": "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8 problem-statement ADRs partly stale; design/ vs docs/adr location split.",
      "id": "TD3-A1",
      "resolution": "Assigned at re-glob (runner epic or root): update counts/scope/version/pin; add staleness notes or formalize ADRs; cross-reference ADR locations (no engine change)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules with disables (dispatch.py 542, _factories.py 1393, _factories_extras.py 511 + duplicate disables, test_semantic_check.py 506), dead compat shims, duplicated test helpers, milestone-ID test names, hardcoded checkout paths.",
      "id": "TD3-A2",
      "resolution": "Owned by the three epics per audit rows; each removal names a survivor; blocking-debt limbs pinned or explicitly flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "No model ships in iteration 3; intent's swap clause is deferred until a compliant model is proven. Epics build backend/cache infrastructure against FakeBackend + tracked cache; model wiring is a bounded follow-up once the verdict lands.",
      "context": "Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.",
      "decision": "Defer model implementation to a follow-up contingent on (a) double-rated real brush-off sample resolving the corpus-construction defect and (b) human Fastino license decision if GLiDE is recommended. Iteration 3 delivers everything model-independent: heuristic-first DecisionBackend + tracked cache infrastructure, runner/checkers debloat, docs reconciliation.",
      "id": "ADR-009",
      "title": "No-go-gated semantic implementation with infrastructure-first delivery"
    },
    {
      "consequences": "Backend/cache work proceeds against pinned contracts without waiting for the model verdict; a compliant model plugs in via get_backend() + DECISION_MODEL with no pipeline refactor.",
      "context": "Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending.",
      "decision": "Adopt iteration-2 spike contracts as authoritative unless contradicted at HEAD: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1] with heuristic-first hard gate; tracked JSON array .python-setup-decisions.json at linted root (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint read-only with hash-asserted zero writes; explicit CI-guarded refresh (lockfile + merge + atomic); prune empty-files + stale-model; writer-first concurrency verdict from pylint-cache-assumptions (merge pending item first if unmerged).",
      "id": "ADR-010",
      "title": "Adopt iteration-2 semantic spike contracts as build baseline"
    },
    {
      "consequences": "Subsystem epics start immediately with disjoint ownership; no concurrent shared-infra edits; semantic epic keeps symbol-level protocol with root regen on heuristic shift.",
      "context": "M4 audits merged with the unified 5-owner map (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15) but report completeness validates at iteration-3 replan via HEAD re-glob per ADR-008; several headline findings (dispatch.py 542-line disable, baseline compat shims, duplicated factory disables) are already verified at HEAD.",
      "decision": "Re-validate the unified map at iteration-3 start (re-glob HEAD, confirm 5-owner counts + symbol exclusions + planned-path reservations), then spawn runner, checkers, and semantic epics in one wave under the narrowed cross-epic protocol: semantic NEVER writes tests/data/** (shift report + root regen); AGENTS.md split by section with M1-merge prerequisite; tests/assumptions append-only; shared .py symbol ownership only.",
      "id": "ADR-011",
      "title": "Validated-map epic decomposition in one wave"
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
