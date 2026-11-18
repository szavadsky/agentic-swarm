# Step: PM Edits

## Goal
Deconstruct the approved architectural plan into scheduled, executable item specifications (`edits` artifact).

## Rules
- Yield only: you have NO file tools. Everything you need is below (`{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "Scope table: {path, owner in {runner,checkers,semantic,root}, single-writer item slug} at pinned clean HEAD; universe src+scripts+tests minus tests/data; root group (tests/data, config, docs except assigned rows, repo-root except packaging exception); exclusions (_semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block); planned paths (checkers/_decision_backend, decisions/_decision_cache per ADR-018, conftest reservation); artifact = item report, informational, non-gating.",
        "Gate baseline table: {format exit, lint per-tool, pytest counts, integration 9-collected with pre-commit env, golden hash, baseline []} + `uv run lint` check-only verification (git status clean) confirming split-gate reunification or retaining split; red recorded as red with follow-up routing (non-gating record, does not fail on red). M2-M4 items verify against this table.",
        "Secrets verification: filtered scan `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` with ^\\.factory/ filter (.secrets.baseline:42-44 list-pattern; version + should_exclude_file signature cited) exits 0 on clean checkout (fresh scratch clone at pinned HEAD); planted control secret (planted + git-added in scratch clone, exact string in report, clone discarded after) exits 1; journals committed."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Scope snapshot without gating\n  Given a pinned clean HEAD (git status clean + SHA cited)\n  When scope-table-snapshot runs\n  Then every universe file lists owner + single-writer item, exclusions reference existing symbols, reservations name planned paths only, and M2-M5 proceed without depending on it",
        "Scenario: Secrets mechanism verified\n  Given the merged ^\\.factory/ filter\n  When the filtered scan runs on a clean checkout plus a git-added planted control secret in a scratch clone\n  Then clean exits 0, planted exits 1, cited with filter + version + HEAD, and the scratch clone is discarded",
        "Scenario: Gates baseline recorded with red handling\n  Given a clean HEAD\n  When gate capture runs format + lint + pytest + integration\n  Then the table records exits/counts/hashes, baseline [], golden hash, and lint check-only verdict; red cells are recorded with follow-up routing and the item still passes as a non-gating record"
      ],
      "title": "Kickoff and green-gate preconditions (non-blocking)"
    },
    {
      "directionalInterfaces": [
        "Checkers factories split: tests/checkers/_factories*.py each <=500, no too-many-lines, ParameterSet typing, all importers (recounted via grep at HEAD; 8 families per review, verify) migrated, behavior identical; touched files toward naming/marker conventions.",
        "Runner factories trim: tests/runner/_factories_extras*.py each <=500, duplicate disables collapsed to <=1, importers (enumerated via grep) migrated, behavior identical.",
        "Threshold consolidation: one deduped parametrized table (lists recounted at HEAD; outcomes pinned), modules <=500, no suppressions; preserved by M4 (handoff).",
        "SEMANTIC guards: all heuristic tests in both checker files (recounted at HEAD; 40+11 per pack) pass with monkeypatched SEMANTIC=0, outcomes pinned; pipeline block left for M4 handoff.",
        "Baseline merge: baseline-diff coverage in <=2 modules <=500, overlapping cases merged, each names survivor; pinning limbs preserved or flagged; shim serializes after.",
        "Portability (4 files only): stale disables removed, /home/slava paths replaced via tmp/env, stale comments fixed; forbids prune-owned 6 + dispatch-owned test_lint_runner.py.",
        "Never-test-linting prune (6 files only): each removed group names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept (survivor allowed only if the report proves smoke itself violates never-test-linting); golden/integration contracts kept."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Factories split without behavior change\n  Given over-limit factories\n  When splits merge\n  Then each module <=500 with no disable (grep zero too-many-lines), importers pass, no new failures vs M1 baseline table (exits/counts cited), golden hash-equal",
        "Scenario: Threshold deduped plus guards pinned\n  Given overlapping tables plus unguarded heuristic tests\n  When consolidation plus guards merge\n  Then one table pins exact outcomes (parametrized IDs + outcomes in report), all heuristic tests pass with SEMANTIC=0, no new failures vs M1 table, golden hash-equal",
        "Scenario: Baseline merged with survivors\n  Given overlapping baseline tests\n  When merge completes\n  Then <=2 modules <=500, each merged case names its survivor, pinning limbs preserved or flagged as blocking debt, no new failures vs M1 table, golden hash-equal",
        "Scenario: Portability cleaned in owned files\n  Given stale disables plus hardcoded paths\n  When cleanup merges\n  Then disables removed (grep zero in touched files), hardcoded checkout paths gone (grep zero in touched files), no new failures vs M1 table, golden hash-equal",
        "Scenario: Gate-duplicating tests pruned with pin retained\n  Given self-lint groups\n  When prune merges\n  Then each removal names its survivor in a removal→survivor map, the default pin (test_real_pipeline_smoke.py kept, or a survivor only if smoke itself violates the boundary) is default-collected, golden/integration contracts kept, no new failures vs M1 table"
      ],
      "title": "Test infrastructure debloat first"
    },
    {
      "directionalInterfaces": [
        "Dispatch split (after shim): runner/dispatch*.py each <=500, zero too-many-lines; TOOLS stays the frozen canonical built-in list, LINT_TOOLS the live mutable registry (mutation semantics preserved for register_lint_tool and its consumers); EXPECTED_TOOL_NAMES keeps deriving from TOOLS; all public names single-sourced re-exported through runner/__init__.py (sole __init__ writer; removes peek lines :17/:22/:62 iff shim deleted); FORMATTER_ONLY/RECORDLESS explicit; registry tests (test_lint_runner incl :7 disable, stats, t3, fakes) pass.",
        "Shim removal (after baseline-merge): baseline _FALLBACK_TOOLS/peek/_compare_sorted plus parsers re-exports deleted (grep zero) or kept with in-repo consumer evidence (file:line citations) + debt note; asserting tests (enumerated via grep) updated; does not touch __init__/dispatch.",
        "Stream helper: NEW checkers/_source_stream.py/.pyi exposing read_module_source(node)->str, is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates to it; _base helper untouched — coexistence documented), and split_trailing_comment(line)->(code, comment|None) for trailing paths where mechanical (@beartype, decode-if-bytes UTF-8 preserving current semantics, tach-clean, <=500); all grep-enumerated `\\.stream\\(\\)` sites replaced (grep zero copies outside helper); zero _base.py/.pyi diff.",
        "Legacy cleanup (after backend for joiner): _legacy_scan renamed to _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21) with call sites; trivial_wrapper dead _legacy_* removed plus peek line matching runner close-up (deleted iff runner deleted, else kept); astroid 3.x body[0].value branch (:247-271) deleted; register() scope = conformance/*.py only per ADR-012 (no @beartype); mixin misc removed or retained-with-justification + blocker; joined codes emitted via imported normalize_suppressed_codes (bare-except single); skips no_try_import register line; shift report {class, keys, snippet, file:line} if outcomes shift.",
        "Pyi spike verdict: {reproduction, golden counts, latent budget (205 symbols + duplicate-code), recommendation fix-with-regen vs document-orphan-only, I5 plan} — report only, no I4 code or golden change."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Runner split without drift\n  Given dispatch 542 plus shims\n  When splits merge in shim->dispatch order\n  Then modules <=500 with no disables (grep zero), registry single-sourced with live LINT_TOOLS semantics preserved (registry tests pass), shims deleted (grep zero shim symbols) or kept with consumer evidence + debt note (report cites file:line), no new failures vs M1 table, golden hash-equal or shift-reported ({class, keys, snippet, file:line})",
        "Scenario: Checkers helper plus legacy without drift\n  Given duplicated stream blocks plus legacy names plus dead code\n  When helper plus cleanup merge (legacy after backend joiner)\n  Then zero copies outside helper (grep zero), zero _base diff (`git diff -- _base.py _base.pyi` empty), joined codes emitted via the shared helper, 51 heuristic outcomes pinned or shift-reported, no new failures vs M1 table",
        "Scenario: Pyi scope decided without code change\n  Given companion-stub blind spot\n  When spike completes\n  Then verdict recommends fix (with I5 budget + regen plan) or orphan-only (with docs note), no I4 golden change"
      ],
      "title": "Production rule enforcement and code debloat"
    },
    {
      "directionalInterfaces": [
        "Backend (ADR-014 pinned): DecisionBackend Protocol decide(justification,rule,context)->float [0,1]; DECISION_THRESHOLD=0.5 + PROMPT_VERSION='prompt-v1'; veto final = heuristic AND (prob>=0.5) when available else heuristic; check_if_meaningful signature preserved + optional kwarg backend=None (public .pyi) on both fns; SEMANTIC='0' preserved; semantic_check bool|None preserved for direct callers (loader None -> heuristic stands; check_if_meaningful always bool); normalize_suppressed_codes(raw)->str in _base (+.pyi) single-owns join/sort/match; test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY under PYTEST_CURRENT_TEST (loader pins both); FakeBackend 1.0/NoBackend/get_backend; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one structlog warning; [semantic] empty placeholder (uv.lock zero edge); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warn+ignore once per process; tach-clean, @beartype, structlog, each <=500; .gitignore untouched (legacy .cache intentional), no hatch entry; stale _base.pyi rule/context doc fixed.",
        "Cache (ADR-017/018): python_setup_lint/decisions/_decision_cache.py (+.pyi) at linted root .python-setup-decisions.json (array sorted by (rule, justification, model), indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized, rule joined, model '<id> rev <short12> prompt-vN', decision, files sorted unique POSIX} + {version, prompt hash, last-seen}; key (justification,rule,model); read-only lint (hash-asserted zero writes); `lint --refresh-decisions [--path ...]` explicit refresh (RunnerConfig.refresh_decisions threading via _cli_complexity + cli.py; lockfile + merge + atomic replace in target dir, DECISIONS_PATH test-only isolation, CI-fail under CI/GITHUB_ACTIONS); prune automatic missing/stale; --path scoping (unscanned retained); jobs==1 required else loud fail; tach.toml adds decisions module + edges.",
        "Spike verdict (consumed, not advisory): {verdict: feasible|blocked}; feasible carries every ADR-017/018 field + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and backend/cache impls merge no-op attestations citing it.",
        "Tests (no AGENTS): M2 deduped table preserved (reranker classes rewritten only); FakeBackend kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format incl sort-key determinism (double-run byte-identical); vacuous + ImportError-propagation deleted; 4 pair tests (:432,453,473,493) deleted iff reranker-coupled (imports/calls sentence-transformers or _load_reranker/_reset_cache), else marked slow; pipeline block after guards; cache-semantics assumptions rewritten deliberately; modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model); full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs; CHANGELOG snippet in report only; ADR-014/016 full Context/Decision/Consequences with pinned values.",
        "Corpus pilot: two-pass real brush-off sample (N>=100 post-dedup, both strata non-empty, rubric + per-source/stratum split, pass-1 + blinded pass-2 + documented adjudication + agreement disclosed, terse borderlines re-rated); single-author bias NOT fully repaired — I5 still requires an independent second rater; or explicit I5 blocker (collection/license/CPU); report only."
      ],
      "id": "M4",
      "scenarios": [
        "Scenario: Veto backend without model\n  Given ADR-009 no-go\n  When backend merges (or no-op attests on blocked verdict)\n  Then brush-off never reaches backend (uncalled asserted), one call per unique pair, cache-hit without model emits persisted verdict with no load, no retry storm (one warning asserted), Fake 1.0 + threshold 0.5 applied, SEMANTIC=0 hash-equals golden, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Cache read-only plus explicit refresh\n  Given tracked schema per ADR-017/018\n  When cache merges (or no-op attests on blocked verdict)\n  Then normal lint shows zero writes by hash, `lint --refresh-decisions` on tmp merges + prunes + atomic-replaces with deterministic (rule, justification, model) order (double-run byte-identical) plus CI-fail + isolation + jobs-guard tests, secrets + tach scans clean, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Corpus pilot with honest bias disclosure\n  Given 215/0 defect plus single-adjudicator limits\n  When corpus spike completes\n  Then report cites N>=100 post-dedup, both strata non-empty, per-source/stratum split, rubric, two-pass protocol + agreement usable as an I5 pilot input — with single-author bias explicitly NOT repaired (independent second rater remains an I5 trigger) — or names an explicit blocker (collection/license/CPU) with I5 plan"
      ],
      "title": "Semantic backend plus tracked cache infrastructure (no model)"
    },
    {
      "directionalInterfaces": [
        "Regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (tests/_golden.py:53) locally only (fails under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against shift reports; golden + tool counts together; no blind regen; no-op attestation with hash equality if all no-shift; ONLY regen-hatch writes tests/data/golden.",
        "Docs exact-strings checklist: semantic-justification.md contains 'DecisionBackend', '.python-setup-decisions.json', 'ADR-009', 'prompt-v1', 'veto', 'FakeBackend'; custom-checks.md contains 'DecisionBackend'; troubleshooting.md contains 'PYTHON_SETUP_LINT_DECISION_MODEL', 'PYTHON_SETUP_LINT_RERANKER_MODEL', 'deprecated'; AGENTS.md pipeline contains 'DecisionBackend' and no 'reranker' (case-insensitive) in that subsection, Tool Scope contains 'ruff format', Quick Commands integration row contains the --collect-only count plus 'passed' and 'skipped' split (9 collected; 9 passed with pre-commit env, 7 passed + 2 skipped without); CHANGELOG.md contains '[semantic]', 'no-go', '1.2.10', '.python-setup-decisions.json'; README.md contains 'v1.2.10'; config/ty.toml grep-zero 'sentence_transformers'; docs/adr/ADR-013..018 each contain 'Context', 'Decision', 'Consequences'.",
        "Final gate table: {format exit, lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD), pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist}; red cells route to new root/follow-up items, never baseline edits. Absolute green required at M5 only."
      ],
      "id": "M5",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given shift/no-shift declarations from all behavior items\n  When regen-hatch runs\n  Then golden hash-equal if all no-shift (no-op attestation), else regenerated locally with double-run plus key-by-key review matching shift reports, committed together",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When final validation completes\n  Then gate table records all cells plus docs exact-strings per checklist with absolute green (format exit 0, lint zero new, pytest/integration per contract, baseline [], golden hash or reviewed regen); any red cell fails with routing to follow-ups, never baseline edits"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect makes precision unevaluable and all repo labels single-author; GLiDE needs human review; CC-BY-NC excluded per allowlist; gliner2 py3.14 unverified.",
      "id": "U1",
      "spikeOutlines": [
        "brush-off-corpus-spike (fact-finder, report-only): two-pass real brush-off pilot (N>=100, both strata, rubric + agreement + splits; bias NOT fully repaired) for I5 bake-off; independent second rater still required in I5; no model choice in I4"
      ]
    },
    {
      "description": "Tracked-cache contract validation (root guard, encoding, sort key, prune, refresh shape, --path, jobs>1, placement, secrets fields) is spiked against the ADR-017/018 pinned contract; writer-first verdict must be consumed; verdict enum gates impls.",
      "id": "U2",
      "spikeOutlines": [
        "decision-cache-design-spike (poc on tmp, no committed files): validate ADR-017/018 contract + deterministic-given-cache+model proof with hash-asserted zero normal-lint writes; verdict feasible|blocked consumed by impls (no-op attestation on blocked)"
      ]
    },
    {
      "description": "Whether pylint-pyi companion-stub skip is fixed (with 205-symbol cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden and exposes large latent cleanup.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs orphan-only for I5"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Report-only, zero repo writes. At pinned clean HEAD (git status clean + SHA cited): git ls-files filtered to src+scripts+tests minus tests/data; recount universe total + per-owner counts from I2 map (67/83/15/4/15) within ±5; record commands + HEAD SHA + revision map-<short> consistently. Confirm exclusions existence (file:line only): _semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block. Confirm reservations absent at HEAD (or corrected). List root group once. Emit revised file-level single-writer table (dispatch owns __init__ after shim, LINT_TOOLS live registry preserved, no TOOLS-alias deletion; shim after baseline-merge; stale/prune 4+6 disjoint files; dispatch owns test_lint_runner.py; guards->semantic-tests and threshold-M2->M4 handoffs; backend owns joiner, legacy deps backend; cache-impl owns tach.toml + CLI threading) + drift list {path,auditRef,headEvidence,confirmed|corrected|disputed} (disputed allowed). Capture gate baseline (format, lint per-tool, pytest counts, integration 9-collected with env, golden hash, baseline []) + `uv run lint` check-only verification (git status clean) to confirm split-gate reunification or retain split. Informational, non-gating: no M2-M5 item depends on it; records red as red with follow-up routing (does not fail on red). M2-M4 items verify against this table (no new failures; red routes to follow-ups).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "scope-table-snapshot",
      "title": "Snapshot scope table and gate baseline (non-gating)"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Verify merged .secrets.baseline:42-44 ^\\.factory/ should_exclude_file list-pattern form against installed detect-secrets (cite version + should_exclude_file signature). Filtered scan = `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` on a clean checkout (fresh scratch clone at pinned HEAD SHA, no untracked): exits 0. Planted control secret (exact string, e.g. documented AWS example key): plant + git add inside the scratch clone (tracked-visibility required for git ls-files), scan (expect exit 1), then discard the clone so pinned HEAD stays clean; report exact plant/add/scan/remove steps for reviewer replication. Cite mechanism + version + HEAD, not counts. Journals stay committed; residual-risk caveat (write-time redaction + periodic unfiltered audits). No baseline edits. Feeds M5 gate table.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-scan-verification",
      "title": "Verify secrets exclusion mechanism"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (`from tests.checkers._factories import|from ._factories import`; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test_<method>_given_<condition>_then_<expected> + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-factories-split",
      "title": "Split checkers factories by domain"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/_factories_extras*.py + its importers ONLY, enumerated via grep at HEAD and reported; ~16 modules per pack, verify actual). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; no new failures vs M1 table; golden hash-equal; format-clean.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "runner-factories-trim",
      "title": "Trim runner factories extras below limit"
    },
    {
      "deps": [],
      "description": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "semantic-threshold-consolidation",
      "title": "Consolidate semantic heuristic tables"
    },
    {
      "deps": [],
      "description": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-semantic-guards",
      "title": "Guard heuristic checker tests with SEMANTIC=0"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "baseline-diff-merge",
      "title": "Merge baseline-diff test overlap"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 4 files (tests/runner/test_lint_runner_integration.py, tests/conftest.py, tests/runner/test_setup.py, tests/runner/test_setup_install.py); FORBIDDEN test_lint_runner.py (dispatch-split owns incl its :7 disable), test_autofix_conflict_integration.py + test_t9_7_compose_pyright_live.py + 4 self-lint files (prune owns). Red-test-exempt. Remove stale too-many-lines disables (recount lines at HEAD; 479/418 per pack, verify under-500); replace /home/slava paths (conftest.py:86, test_setup.py:252,277, test_setup_install.py:265-350, verify) with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; no new failures vs M1 table; golden hash-equal; grep zero hardcoded checkout in touched files.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "stale-disables-portability-cleanup",
      "title": "Remove stale disables and hardcoded paths"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 6 files wholly (tests/runner/test_self_lint_clean.py, test_config_consistency.py, test_pyright_noise_filter.py, test_runner_private_imports.py, test_t9_7_compose_pyright_live.py, test_autofix_conflict_integration.py); FORBIDDEN all other test files. Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); hardcoded paths inside owned files handled here (file deleted or path fixed); each removal names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept; a named default-collected survivor is allowed only if the report proves smoke itself violates never-test-linting. Keep golden/integration contracts. Verify: tests only; removal→survivor map in report; pytest (minus removed) + integration show no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "never-test-linting-prune",
      "title": "Prune gate-duplicating tests with survivors"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes, temp copies only. Reproduce: temp .pyi with companion .py (even broken -> skipped) vs orphan .pyi (linted, pyi-underscore fires); count golden 42/43 on .py (verify at HEAD); budget latent cleanup (205 private symbols in 29 stubs + duplicate-code findings, verify). Recommend fix-with-regen (temp-tree/copy or pylint mode + cleanup budget + regen plan for I5) vs document-orphan-only (scope note + stubtest governance). No prod change, no golden change in I4. Feeds I5 plan.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-pyi-scope-spike",
      "title": "Decide pylint-pyi companion-stub scope"
    },
    {
      "deps": [
        "runner-compat-shim-removal"
      ],
      "description": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 150,
      "slug": "runner-dispatch-split",
      "title": "Split dispatch registry below limits"
    },
    {
      "deps": [
        "baseline-diff-merge"
      ],
      "description": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 30,
      "slug": "runner-compat-shim-removal",
      "title": "Remove runner compat shims"
    },
    {
      "deps": [],
      "description": "Owns NEW checkers/_source_stream.py/.pyi + stream read/decode call sites in conformance/stub checkers ONLY; FORBIDDEN _base.py/.pyi (zero diff, semantic-owned), no_try_import register line/patterns (semantic), tests/data, baseline. API (all in _source_stream, @beartype, decode-if-bytes UTF-8 preserving current semantics — item reports exact bytes/str handling verified by tests; tach-clean; <=500 + .pyi): read_module_source(node)->str; is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates its local checker-bound helper to this, passing checker._coverage.patterns.source_roots; _base keeps its existing helper untouched — coexistence documented, future consolidation is backend follow-up); split_trailing_comment(line)->tuple[code, comment|None] adopted by suppression/bare-except trailing paths where mechanical (preceding-comment paths keep local logic unless identical — item reports which). Enumerate sites via grep `\\.stream\\(\\)` at HEAD (report full list; expect suppression/bare-except/stub families, verify) and replace all (grep zero copies outside helper). Verify: grep zero local copies; `git diff -- _base.py _base.pyi` empty; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 100,
      "slug": "checkers-stream-helper",
      "title": "Single-source stream read/decode helper"
    },
    {
      "deps": [
        "checkers-stream-helper",
        "decision-backend-impl",
        "runner-compat-shim-removal"
      ],
      "description": "Owns conformance/*.py (suppression, trivial_wrapper, bare_except, mixins) + stub fidelity rows ONLY; FORBIDDEN _base.py/.pyi incl stale doc (zero diff; backend-impl fixes _base.pyi), no_try_import register line/patterns, tests/data. Depends on decision-backend-impl for the joiner import contract: `from python_setup_lint.checkers._base import normalize_suppressed_codes` (pinned by backend-impl; this item does not implement join logic). Rename _legacy_scan -> _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21, verify at HEAD) with all call sites; remove trivial_wrapper dead _legacy_* unconditionally + peek line iff runner confirms deletion (else keep); delete astroid 3.x body[0].value branch (suppression_justification_checker.py:247-271, verify; floor astroid>=4.0.4); register() scope = conformance/*.py only, missing-beartype justification per ADR-012 (no @beartype added); mixin misc via shared typed base attempt with retain-and-report fallback; call joined-code emission via the imported helper (bare-except keeps single symbol). Fix .pyi fidelity rows. On shift: shift report + CHANGELOG snippet (root regenerates). Verify: grep zero _legacy_scan/_legacy_* (except retained peek if runner kept); no new failures vs M1 table; 51 heuristic outcomes pinned or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 40,
      "slug": "checkers-legacy-dead-cleanup",
      "title": "Rename legacy scan and remove dead compat"
    },
    {
      "deps": [],
      "description": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; `lint --refresh-decisions [--path ...]`; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "decision-cache-design-spike",
      "title": "Prototype tracked-cache schema and refresh"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Two-pass pilot for the I5 bake-off (single-author bias NOT fully repaired — downgraded honestly): collect N real repo suppressions + threshold 30+50 + brush-off/meaningful tables, DEDUPED by normalized justification (target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both strata non-empty); rubric (specific technical justification vs placeholder/deferral/brush-off). Rater protocol: pass 1 rates all items; pass 2 re-rates blinded (shuffled order, pass-1 labels hidden); disagreements resolved by a documented adjudication rule (disclose rule + edge-case rubric); report inter-rater agreement between the two passes. Terse borderlines re-rated. Per-source + per-stratum split. Recommend smallest-evaluable corpus + threshold sweep for I5 90/95/85 bars on accepted stratum, or explicit blocker (collection/license/CPU). I5 still requires an independent second rater before any go/no-go. No model choice in I4.",
      "escalate": true,
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "brush-off-corpus-spike",
      "title": "Build two-pass brush-off pilot sample"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "semantic-threshold-consolidation"
      ],
      "description": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 150,
      "slug": "decision-backend-impl",
      "title": "Implement veto DecisionBackend with FakeBackend"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "runner-compat-shim-removal",
        "runner-dispatch-split"
      ],
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py/.pyi + refresh threading (runner/cli.py --refresh-decisions branch + help text, runner/types.py RunnerConfig.refresh_decisions: bool = False field, runner/_cli_complexity.py _parse_config_args/_build_runner_config threading; --path scoping reuses existing --path plumbing) + tach.toml (sole owner: add decisions module depends_on=[] + checkers/runner depends_on=[decisions]) ONLY, applied onto final runner shape after dispatch split; FORBIDDEN _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-017 contract as validated by spike (array sorted by (rule, justification, model), indent2 sort_keys; entry + {version, prompt hash, last-seen}; secrets-clean encoding; read-only lint hash-asserted zero writes; explicit refresh lockfile + merge + atomic replace in target dir with DECISIONS_PATH test-only isolation; prune auto missing/stale; --path scoping; jobs==1 required else loud fail; CI-fail). Must pass all tools incl detect-secrets and tach check. Existing gate contracts unchanged. Verify: tmp round-trip; zero-writes hash; refresh merges + prunes + sorts deterministically (double-run byte-identical); CI-fail + isolation + jobs-guard tests; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 120,
      "slug": "decision-cache-impl",
      "title": "Implement tracked decision cache and refresh"
    },
    {
      "deps": [
        "checkers-semantic-guards",
        "decision-backend-impl",
        "decision-cache-impl",
        "semantic-threshold-consolidation"
      ],
      "description": "Second writer (after M2 handoffs): threshold 2 files (preserve M2 deduped table; rewrite reranker classes only) + suppression-file pipeline block (after guards) + tests/assumptions runtime/decision/cache modules (append-only; deliberate cache-semantics rewrite, not loosened; never touch root __init__ + astroid/beartype/pylint contracts) + semantic-justification.md + custom-checks bullet + troubleshooting section + docs/adr/ADR-014.md + ADR-016.md ONLY; FORBIDDEN AGENTS.md/CHANGELOG.md (snippet in report; docs writes file), tests/data, src. Merge tables pinned (preserved); FakeBackend kwarg + env; cache tmp + hypothesis format incl sort-key determinism; delete vacuous + ImportError-propagation; 4 pair tests (test_semantic_check.py:432,453,473,493, verify): deleted iff the class imports/calls sentence-transformers or _load_reranker/_reset_cache (reranker-coupled), else marked slow; full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs. Modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model). Docs state veto + cache + no-go; ADRs carry Context/Decision/Consequences + pinned values. Verify: no new failures vs M1 table; golden hash-equal or shift-reported; rumdl clean.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "semantic-tests-rewrite",
      "title": "Rewrite semantic tests and docs (no AGENTS)"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-legacy-dead-cleanup",
        "checkers-semantic-guards",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "never-test-linting-prune",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Sole AGENTS.md + CHANGELOG.md + README.md + config/ty.toml + docs/adr/ADR-013.md + ADR-015.md writer in I4 (after all M2 counts-affecting items + M3 registry/behavior items + M4 backend/cache/tests); FORBIDDEN semantic-justification/custom-checks/troubleshooting/ADR-014/016 (semantic-tests), tach.toml (cache-impl), tests/data, src except ty.toml comment. AGENTS counts from rerun actuals (verify --collect-only + TOOLS==14 + 9-collected contract) + Tool Scope ruff-format row + pipeline subsection (DecisionBackend, no reranker) + testing strategy; CHANGELOG user-visible (extra contents, new/deprecated vars incl full PYTHON_SETUP_LINT_DECISION_MODEL name, cache file, no-go note + version 1.2.10); README v1.2.10 pin; ty.toml remove sentence_transformers; ADRs full Context/Decision/Consequences. Verify: docs-only diff; exact-strings grep per M5 checklist (incl ADR-013..016 Context/Decision/Consequences); rumdl clean; no new failures vs M1 table.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "docs-reconciliation",
      "title": "Reconcile docs counts and versions"
    },
    {
      "deps": [
        "checkers-legacy-dead-cleanup",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "semantic-tests-rewrite"
      ],
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items: run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (tests/_golden.py:53; never under CI/GITHUB_ACTIONS — guard fails), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on shift reports"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-semantic-guards",
        "docs-reconciliation",
        "golden-regen-hatch",
        "never-test-linting-prune",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Report-only, zero writes. Record final gate table: format exit 0; lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD); pytest counts; integration 9-collected-0-failed with pre-commit env pinned; golden hash or regen diff; baseline []; docs exact-strings per M5 checklist. Red-cell routing to new root/follow-up items, never baseline edits. Absolute green is required here (M5 only); red cells fail the gate with routing. Feeds close-up.",
      "kind": "fact-finder",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material (dormant path). Tightening intentional when a model ships.",
      "disposition": "confirm with human",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits. Real-model tests are slow + with_real_api, never in default suite.",
      "why": "Matches current venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator secrets answers stand: journals committed; ^\\.factory/ filter merged; harness filter-seeding outside task; acceptance cites mechanism + HEAD.",
      "why": "Steering directive 1794158471467."
    },
    {
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without). AGENTS.md reconciled to this contract.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
    },
    {
      "assumption": "Iteration 4 ships semantic infra only (backend/cache/FakeBackend/docs/corpus pilot); model swap NOT complete at close-up and must not be claimed. I5 triggers: two-pass pilot + independent second rater repairing 215/0, human Fastino decision if GLiDE recommended, CPU latency/RSS benchmark.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating extended by ADR-016; operator must approve infra-only close-up."
    },
    {
      "assumption": "No child epics in iteration 4; all work as 22 root items within the 50-item cap, with file-level single-writer + dep serialization (ADR-013).",
      "why": "I3 epic gate caused 3 empty waves + zero M2 delivery; direct increments avoid bottleneck."
    },
    {
      "assumption": "Model license allowlist: Apache-2.0 / MIT / BSD-2/3-Clause allowed; CC-BY-NC-4.0 and other non-commercial excluded; Fastino Community + unclear/no-license flagged for human review; no model ships without a license verdict.",
      "disposition": "confirm with human",
      "why": "MIT tool cannot absorb non-commercial/unclear model licensing; I5 bake-off needs the gating criterion before any verdict."
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "id": "TD4-B1",
      "resolution": "ADR-009 extended by ADR-016: no model in I4; brush-off-corpus-spike produces a two-pass pilot + rubric + agreement (bias NOT fully repaired); I5 bake-off additionally requires an independent second rater; backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "category": "blocking",
      "description": "I3 M1 gate not closed per engine (map running, kickoff pending) caused 3 empty waves.",
      "id": "TD4-B2",
      "resolution": "ADR-013 abandons epic gate for I4; scope-table-snapshot informational non-gating; closeup-3 verified repo scope carries forward; M2-M5 proceed via file ownership + deps; M2-M4 verify relative to the M1 table, absolute green enforced only at M5."
    },
    {
      "category": "blocking",
      "description": "Cache refresh/root/prune/secrets unresolved (Q4-7); writer-first verdict must be consumed, not invented; blocks M4 backend/cache impls.",
      "id": "TD4-B3",
      "resolution": "ADR-017 pins the refresh contract (+ADR-018 placement); decision-cache-design-spike validates it on tmp with verdict enum (feasible + 4 proofs, or blocked with I5 plan); backend/cache impls consume verdict via deps (no-op attestation on blocked) and rewrite assumption file deliberately."
    },
    {
      "category": "impacting",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, 205 latent private symbols, companion stubs unenforced).",
      "id": "TD4-I1",
      "resolution": "pylint-pyi-scope-spike reproduces + recommends fix-with-regen vs orphan-only with budget; fix + golden regen deferred to I5; I4 golden unchanged on this axis."
    },
    {
      "category": "adjacent",
      "description": "Docs/version drift (AGENTS stale counts/scope/pipeline, CHANGELOG 1.2.9 vs 1.2.10, README v1.2.5 pin, ty.toml sentence_transformers, ADR-013..018 stubs, legacy .gitignore .cache lines retained intentionally).",
      "id": "TD4-A1",
      "resolution": "docs-reconciliation sole AGENTS/CHANGELOG/version/pin/ty.toml/ADR-013/015 writer in I4 (after M2 + M3 + backend/cache/tests); semantic-tests owns non-AGENTS semantic docs + ADR-014/016 and emits CHANGELOG snippet in report; cache-impl owns tach.toml; .gitignore legacy lines kept by design (.cache still ignored; decisions file committed)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules/shims/duplicates/hardcoded paths (dispatch 542, _factories 1393, _factories_extras 511 + dup disables, test_semantic 506, baseline shims, stream blocks, mixin misc, trivial-wrapper disables, /home/slava paths) + _base/_source_stream _is_under_source_root coexistence.",
      "id": "TD4-A2",
      "resolution": "Split across M2-M3 items per evidence with disjoint files + handoff deps; each removal/merge names survivor; default pipeline pin retained; register() per ADR-012, mixin per attempt-with-fallback; _source_stream helper is canonical for checker call sites going forward, _base keeps its existing helper (zero-diff constraint) with future consolidation as backend follow-up."
    }
  ],
  "adrs": [
    {
      "consequences": "No epic close-ups/handoff in I4; M5 regen consumes item shift declarations directly. 13 dep-free wave-1 items avoid empty waves. Parallel same-file is forbidden; sequential same-file is permitted only via explicit deps with pinned handoff order (guards->semantic-tests, threshold-M2->threshold-M4, baseline-merge->shim->dispatch, backend->legacy-joiner). I5 may reintroduce epics or continue root increments.",
      "context": "I3 planned 3 epics behind map-revalidation + kickoff gate; map stalled (retry + 3 empty waves, Blocked none), kickoff pending, M2 zero delivery per closeup-3. Map + kickoff reports live in orchestration records with high QA surface on report-only items, creating a single-item bottleneck. Review further requires file-level proof for parallel items.",
      "decision": "Iteration 4 ships no child epics; all work as root items with file-level single-writer for parallel items plus dep serialization for handoffs (dispatch/baseline/parsers/__init__ chain, checkers stream->legacy, threshold-M2->backend/M4, guards->semantic-tests, baseline-merge->shim, backend-joiner->legacy, factories/threshold/guards/baseline/portability/prune disjoint, AGENTS/CHANGELOG, golden). Scope-table-snapshot is informational, non-gating. M2-M5 proceed without map-revision gate.",
      "id": "ADR-013",
      "title": "Root-serialized delivery replaces epic decomposition for iteration 4"
    },
    {
      "consequences": "Brush-off rejections guaranteed regardless of model; model only tightens acceptance; SEMANTIC=0 deterministic contract preserved; threshold continuity with current 0.5; single joiner implementation shared by extraction and matching; backend/cache tests assert veto (brush-off uncalled, one call per unique pair, hit without load, no retry storm, warnings once).",
      "context": "ADR-010 says heuristic-first hard gate but current code is semantic-first with heuristic fallback (_base.py:150-158 vs _semantic.py:1-12). Open Q1 asks gate meaning, float vs bool, None mapping. Review requires pinned threshold, kwarg placement, None mapping, joiner ownership, Fake values, warning channel, extra shape, full env names.",
      "decision": "Veto: final = heuristic(text) AND (backend.decide(...)>=DECISION_THRESHOLD) when backend available, else heuristic. DECISION_THRESHOLD=0.5, PROMPT_VERSION='prompt-v1'. Backward-compat optional kwarg backend: DecisionBackend|None=None (keyword-only, public in .pyi) on BOTH check_if_meaningful and semantic_check_if_meaningful; existing 5 call sites unchanged. None mapping: loader/backend None -> heuristic stands; semantic_check preserves bool|None for direct callers, check_if_meaningful always returns bool. Joined rule owned solely by decision-backend-impl as normalize_suppressed_codes(raw)->str in _base.py (+.pyi): strip, drop empties, dedupe, ASCII-sort, join ',' (no spaces); echo matches if primary_lower equals any element_lower; bare-except keeps single symbol; legacy-cleanup imports it (dep edge backend->legacy). FakeBackend.decide returns 1.0; Fake model string 'fake-backend rev test prompt-v1' (no bare hex>=20). Warnings via structlog warning event 'decision_model_unavailable' (model + reason fields) once per process via sentinel; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warns once per process; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader returns None + exactly-one warning in I4. No retry storm. [semantic] extra retained as empty placeholder (no dependencies) with comment; uv.lock regenerated with zero sentence-transformers edge for the extra. Cache key (justification,rule,model); context is model-input only.",
      "id": "ADR-014",
      "title": "Heuristic-first veto semantics for DecisionBackend (pinned values)"
    },
    {
      "consequences": "'Coding rules enforced' not overstated in I4; golden stable on this axis; I5 plan consumes spike verdict with explicit budget.",
      "context": "_PylintPyiLintTool passes .pyi paths but pylint skips companion stubs (even broken) and lints orphan only; golden 42/43 pyi findings on .py; probe finds 205 latent private stub symbols; fixing changes golden + exposes large cleanup, conflicting with preservation unless staged.",
      "decision": "I4 runs pylint-pyi-scope-spike only (reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs document-orphan-only). No prod change, no golden change on this axis in I4. Fix + regen (if recommended) scheduled in I5.",
      "id": "ADR-015",
      "title": "Pylint-pyi scope decided by spike, fix deferred to iteration 5"
    },
    {
      "consequences": "Intent swap clause remains open after I4; infra makes I5 wiring bounded (get_backend + PYTHON_SETUP_LINT_DECISION_MODEL, no pipeline refactor); gates stay offline/fast/deterministic.",
      "context": "ADR-009 deferred model on 215/0 structural no-go + single-adjudicator limits + Fastino review + no CPU bench. At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled. Two-pass pilot + independent-rater + license + CPU bench still open.",
      "decision": "I4 lands model-independent infra only (veto backend + tracked cache + FakeBackend/NoBackend + packaging swap to no-model + tests/docs + corpus pilot). No model wiring, no real-model default test; exactly one slow+with_real_api e2e SKELETON is required and skipped until a model ships. Model bake-off + wiring gated on I4 corpus pilot + independent second rater + human Fastino decision + CPU bench in I5. Close-up must not claim swap complete.",
      "id": "ADR-016",
      "title": "Iteration-4 semantic scope remains infrastructure-only"
    },
    {
      "consequences": "Single refresh contract for spike validation + impl; no setup-subcommand alternative; CI-safe; test isolation mirrors backend guard; jobs>1 fails loudly instead of silent corruption; deterministic serialization provable via pinned sort key. If spike proves infeasible, it reports verdict blocked and impls merge no-op attestations (must not invent alternative).",
      "context": "ADR-010 requires explicit CI-guarded refresh with lockfile + merge + atomic replace, but invocation shape (lint flag vs setup subcommand vs env sidecar), CI direction, DECISIONS_PATH scope, array sort key, verdict consumption, files cardinality/merge, prune auto-vs-flag, --path scoping, and jobs>1 behavior are unspecified (open Q5-7). Pylint runs as subprocess so verdicts are invisible to runner.",
      "decision": "Refresh invocation is `lint --refresh-decisions [--path ...]` (runner CLI flag; setup-subcommand alternative rejected). Refresh FAILS under CI/GITHUB_ACTIONS (exit non-zero, same guard shape as golden UPDATE_ENV). PYTHON_SETUP_LINT_DECISIONS_PATH is test-only, honored ONLY under PYTEST_CURRENT_TEST; production root is config.cwd with traversal guard (resolved cache path must stay within cwd, no parent escape, no absolute outside). Tracked array is sorted by (rule, justification, model) tuple; object keys use sort_keys. files = sorted unique POSIX relpaths, union-merged on refresh; prune is automatic on refresh for missing files + stale model-id entries (no --prune flag in I4). --path scopes the sweep (entries for unscanned files retained). Refresh requires pylint jobs==1 and fails loudly otherwise (no sidecars in I4). Spike verdict enum: {verdict: feasible|blocked; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it}.",
      "id": "ADR-017",
      "title": "Decision-cache refresh contract (lint flag, CI-fail, test-only isolation)"
    },
    {
      "consequences": "tach check verifies the new boundary; no import duplication; runner/checkers never import each other; tach.toml gains exactly one module + two depends_on edges, owned by a single item.",
      "context": "tach.toml declares both checkers and runner with depends_on=[]. The tracked cache needs cross-module use: runner CLI (refresh write path) and checkers _base/_semantic (read path). Either placement direction violates one empty depends_on; lazy imports are still static imports to tach; no item owned tach.toml so 'tach-clean' was unverifiable.",
      "decision": "Place the cache in a new third module python_setup_lint/decisions/ (file _decision_cache.py +.pyi); checkers and runner both declare depends_on=['python_setup_lint.decisions']; decisions itself depends on nothing. decision-cache-impl solely owns tach.toml in I4 (config exception alongside the refresh threading). _decision_backend.py stays in checkers (imported only by _base/_semantic). The design spike validates this placement; semantic-tests-rewrite uses the decisions import path.",
      "id": "ADR-018",
      "title": "Decision-cache placement in a shared decisions module"
    }
  ]
}`, `iteration: 4
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-plan-3-dotted-path-injection-risk ref=plan-3 disposition=human-awareness: PYTHON_SETUP_LINT_DECISION_BACKEND dotted path has no test-only enforcement (pytest guard/allowlist); if honored in production lint, env control equals code execution. Architect can decide guard now; operator should be aware. Document in ADR-010 with loader test.
  - awareness-plan-3-model-deferral-awareness ref=plan-3 disposition=human-awareness: Intent requires replacing reranker with CPU-friendly decision model (GLiDE-0.4B or smaller) + git cache. ADR-009 defers model to follow-up on corpus repair + Fastino license verdict; iteration-3 delivers DecisionBackend/cache/FakeBackend, no model. Justified by 215/0 eval no-go but operator must approve close-up will not claim swap complete. Record follow-up triggers (double-rated sample, license decision, CPU benchmark).
  - awareness-plan-4-infra-only-closeup-awareness ref=plan-4 disposition=human-awareness: Intent requires replacing the reranker with a CPU-friendly decision model; plan defers all model wiring to I5 on corpus+license+CPU gates, which is sound given the 215/0 no-go but is a scope deviation ADR-009 says the operator must approve at close-up ('must not claim swap complete'). Proceed with infra now; record operator awareness that close-up stays heuristic-first.
  - awareness-plan-4-infra-only-closeup ref=plan-4 disposition=human-awareness: Intent replaces cross-encoder (_semantic.py:1 reranker, sentence-transformers) with CPU decision model + git cache; ADR-016 ships backend/cache/Fake/docs/corpus only, no wiring, close-up must not claim swap, I5 gated on corpus + human Fastino + CPU bench. High-impact cut architect can decide per ADR-009 no-go (215/0, single-author, no bench). Inform operator swap open.
  - awareness-plan-4-material-never-test-boundaries ref=plan-4 disposition=human-awareness: Material = golden SEMANTIC=0 + unit + CLI/exit + baseline/autofix + configs (heuristic material, model never); never-test-linting bans pytest asserting own gates while retaining golden/integration. Both confirm-with-human, I1-approved. Architect decides preserve; golden stays mechanical contract. Informational only.`, kinds guides, `{
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
}`). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "Scope table: {path, owner in {runner,checkers,semantic,root}, single-writer item slug} at pinned clean HEAD; universe src+scripts+tests minus tests/data; root group (tests/data, config, docs except assigned rows, repo-root except packaging exception); exclusions (_semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block); planned paths (checkers/_decision_backend, decisions/_decision_cache per ADR-018, conftest reservation); artifact = item report, informational, non-gating.",
        "Gate baseline table: {format exit, lint per-tool, pytest counts, integration 9-collected with pre-commit env, golden hash, baseline []} + `uv run lint` check-only verification (git status clean) confirming split-gate reunification or retaining split; red recorded as red with follow-up routing (non-gating record, does not fail on red). M2-M4 items verify against this table.",
        "Secrets verification: filtered scan `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` with ^\\.factory/ filter (.secrets.baseline:42-44 list-pattern; version + should_exclude_file signature cited) exits 0 on clean checkout (fresh scratch clone at pinned HEAD); planted control secret (planted + git-added in scratch clone, exact string in report, clone discarded after) exits 1; journals committed."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Scope snapshot without gating\n  Given a pinned clean HEAD (git status clean + SHA cited)\n  When scope-table-snapshot runs\n  Then every universe file lists owner + single-writer item, exclusions reference existing symbols, reservations name planned paths only, and M2-M5 proceed without depending on it",
        "Scenario: Secrets mechanism verified\n  Given the merged ^\\.factory/ filter\n  When the filtered scan runs on a clean checkout plus a git-added planted control secret in a scratch clone\n  Then clean exits 0, planted exits 1, cited with filter + version + HEAD, and the scratch clone is discarded",
        "Scenario: Gates baseline recorded with red handling\n  Given a clean HEAD\n  When gate capture runs format + lint + pytest + integration\n  Then the table records exits/counts/hashes, baseline [], golden hash, and lint check-only verdict; red cells are recorded with follow-up routing and the item still passes as a non-gating record"
      ],
      "title": "Kickoff and green-gate preconditions (non-blocking)"
    },
    {
      "directionalInterfaces": [
        "Checkers factories split: tests/checkers/_factories*.py each <=500, no too-many-lines, ParameterSet typing, all importers (recounted via grep at HEAD; 8 families per review, verify) migrated, behavior identical; touched files toward naming/marker conventions.",
        "Runner factories trim: tests/runner/_factories_extras*.py each <=500, duplicate disables collapsed to <=1, importers (enumerated via grep) migrated, behavior identical.",
        "Threshold consolidation: one deduped parametrized table (lists recounted at HEAD; outcomes pinned), modules <=500, no suppressions; preserved by M4 (handoff).",
        "SEMANTIC guards: all heuristic tests in both checker files (recounted at HEAD; 40+11 per pack) pass with monkeypatched SEMANTIC=0, outcomes pinned; pipeline block left for M4 handoff.",
        "Baseline merge: baseline-diff coverage in <=2 modules <=500, overlapping cases merged, each names survivor; pinning limbs preserved or flagged; shim serializes after.",
        "Portability (4 files only): stale disables removed, /home/slava paths replaced via tmp/env, stale comments fixed; forbids prune-owned 6 + dispatch-owned test_lint_runner.py.",
        "Never-test-linting prune (6 files only): each removed group names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept (survivor allowed only if the report proves smoke itself violates never-test-linting); golden/integration contracts kept."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Factories split without behavior change\n  Given over-limit factories\n  When splits merge\n  Then each module <=500 with no disable (grep zero too-many-lines), importers pass, no new failures vs M1 baseline table (exits/counts cited), golden hash-equal",
        "Scenario: Threshold deduped plus guards pinned\n  Given overlapping tables plus unguarded heuristic tests\n  When consolidation plus guards merge\n  Then one table pins exact outcomes (parametrized IDs + outcomes in report), all heuristic tests pass with SEMANTIC=0, no new failures vs M1 table, golden hash-equal",
        "Scenario: Baseline merged with survivors\n  Given overlapping baseline tests\n  When merge completes\n  Then <=2 modules <=500, each merged case names its survivor, pinning limbs preserved or flagged as blocking debt, no new failures vs M1 table, golden hash-equal",
        "Scenario: Portability cleaned in owned files\n  Given stale disables plus hardcoded paths\n  When cleanup merges\n  Then disables removed (grep zero in touched files), hardcoded checkout paths gone (grep zero in touched files), no new failures vs M1 table, golden hash-equal",
        "Scenario: Gate-duplicating tests pruned with pin retained\n  Given self-lint groups\n  When prune merges\n  Then each removal names its survivor in a removal→survivor map, the default pin (test_real_pipeline_smoke.py kept, or a survivor only if smoke itself violates the boundary) is default-collected, golden/integration contracts kept, no new failures vs M1 table"
      ],
      "title": "Test infrastructure debloat first"
    },
    {
      "directionalInterfaces": [
        "Dispatch split (after shim): runner/dispatch*.py each <=500, zero too-many-lines; TOOLS stays the frozen canonical built-in list, LINT_TOOLS the live mutable registry (mutation semantics preserved for register_lint_tool and its consumers); EXPECTED_TOOL_NAMES keeps deriving from TOOLS; all public names single-sourced re-exported through runner/__init__.py (sole __init__ writer; removes peek lines :17/:22/:62 iff shim deleted); FORMATTER_ONLY/RECORDLESS explicit; registry tests (test_lint_runner incl :7 disable, stats, t3, fakes) pass.",
        "Shim removal (after baseline-merge): baseline _FALLBACK_TOOLS/peek/_compare_sorted plus parsers re-exports deleted (grep zero) or kept with in-repo consumer evidence (file:line citations) + debt note; asserting tests (enumerated via grep) updated; does not touch __init__/dispatch.",
        "Stream helper: NEW checkers/_source_stream.py/.pyi exposing read_module_source(node)->str, is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates to it; _base helper untouched — coexistence documented), and split_trailing_comment(line)->(code, comment|None) for trailing paths where mechanical (@beartype, decode-if-bytes UTF-8 preserving current semantics, tach-clean, <=500); all grep-enumerated `\\.stream\\(\\)` sites replaced (grep zero copies outside helper); zero _base.py/.pyi diff.",
        "Legacy cleanup (after backend for joiner): _legacy_scan renamed to _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21) with call sites; trivial_wrapper dead _legacy_* removed plus peek line matching runner close-up (deleted iff runner deleted, else kept); astroid 3.x body[0].value branch (:247-271) deleted; register() scope = conformance/*.py only per ADR-012 (no @beartype); mixin misc removed or retained-with-justification + blocker; joined codes emitted via imported normalize_suppressed_codes (bare-except single); skips no_try_import register line; shift report {class, keys, snippet, file:line} if outcomes shift.",
        "Pyi spike verdict: {reproduction, golden counts, latent budget (205 symbols + duplicate-code), recommendation fix-with-regen vs document-orphan-only, I5 plan} — report only, no I4 code or golden change."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Runner split without drift\n  Given dispatch 542 plus shims\n  When splits merge in shim->dispatch order\n  Then modules <=500 with no disables (grep zero), registry single-sourced with live LINT_TOOLS semantics preserved (registry tests pass), shims deleted (grep zero shim symbols) or kept with consumer evidence + debt note (report cites file:line), no new failures vs M1 table, golden hash-equal or shift-reported ({class, keys, snippet, file:line})",
        "Scenario: Checkers helper plus legacy without drift\n  Given duplicated stream blocks plus legacy names plus dead code\n  When helper plus cleanup merge (legacy after backend joiner)\n  Then zero copies outside helper (grep zero), zero _base diff (`git diff -- _base.py _base.pyi` empty), joined codes emitted via the shared helper, 51 heuristic outcomes pinned or shift-reported, no new failures vs M1 table",
        "Scenario: Pyi scope decided without code change\n  Given companion-stub blind spot\n  When spike completes\n  Then verdict recommends fix (with I5 budget + regen plan) or orphan-only (with docs note), no I4 golden change"
      ],
      "title": "Production rule enforcement and code debloat"
    },
    {
      "directionalInterfaces": [
        "Backend (ADR-014 pinned): DecisionBackend Protocol decide(justification,rule,context)->float [0,1]; DECISION_THRESHOLD=0.5 + PROMPT_VERSION='prompt-v1'; veto final = heuristic AND (prob>=0.5) when available else heuristic; check_if_meaningful signature preserved + optional kwarg backend=None (public .pyi) on both fns; SEMANTIC='0' preserved; semantic_check bool|None preserved for direct callers (loader None -> heuristic stands; check_if_meaningful always bool); normalize_suppressed_codes(raw)->str in _base (+.pyi) single-owns join/sort/match; test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY under PYTEST_CURRENT_TEST (loader pins both); FakeBackend 1.0/NoBackend/get_backend; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one structlog warning; [semantic] empty placeholder (uv.lock zero edge); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warn+ignore once per process; tach-clean, @beartype, structlog, each <=500; .gitignore untouched (legacy .cache intentional), no hatch entry; stale _base.pyi rule/context doc fixed.",
        "Cache (ADR-017/018): python_setup_lint/decisions/_decision_cache.py (+.pyi) at linted root .python-setup-decisions.json (array sorted by (rule, justification, model), indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized, rule joined, model '<id> rev <short12> prompt-vN', decision, files sorted unique POSIX} + {version, prompt hash, last-seen}; key (justification,rule,model); read-only lint (hash-asserted zero writes); `lint --refresh-decisions [--path ...]` explicit refresh (RunnerConfig.refresh_decisions threading via _cli_complexity + cli.py; lockfile + merge + atomic replace in target dir, DECISIONS_PATH test-only isolation, CI-fail under CI/GITHUB_ACTIONS); prune automatic missing/stale; --path scoping (unscanned retained); jobs==1 required else loud fail; tach.toml adds decisions module + edges.",
        "Spike verdict (consumed, not advisory): {verdict: feasible|blocked}; feasible carries every ADR-017/018 field + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and backend/cache impls merge no-op attestations citing it.",
        "Tests (no AGENTS): M2 deduped table preserved (reranker classes rewritten only); FakeBackend kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format incl sort-key determinism (double-run byte-identical); vacuous + ImportError-propagation deleted; 4 pair tests (:432,453,473,493) deleted iff reranker-coupled (imports/calls sentence-transformers or _load_reranker/_reset_cache), else marked slow; pipeline block after guards; cache-semantics assumptions rewritten deliberately; modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model); full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs; CHANGELOG snippet in report only; ADR-014/016 full Context/Decision/Consequences with pinned values.",
        "Corpus pilot: two-pass real brush-off sample (N>=100 post-dedup, both strata non-empty, rubric + per-source/stratum split, pass-1 + blinded pass-2 + documented adjudication + agreement disclosed, terse borderlines re-rated); single-author bias NOT fully repaired — I5 still requires an independent second rater; or explicit I5 blocker (collection/license/CPU); report only."
      ],
      "id": "M4",
      "scenarios": [
        "Scenario: Veto backend without model\n  Given ADR-009 no-go\n  When backend merges (or no-op attests on blocked verdict)\n  Then brush-off never reaches backend (uncalled asserted), one call per unique pair, cache-hit without model emits persisted verdict with no load, no retry storm (one warning asserted), Fake 1.0 + threshold 0.5 applied, SEMANTIC=0 hash-equals golden, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Cache read-only plus explicit refresh\n  Given tracked schema per ADR-017/018\n  When cache merges (or no-op attests on blocked verdict)\n  Then normal lint shows zero writes by hash, `lint --refresh-decisions` on tmp merges + prunes + atomic-replaces with deterministic (rule, justification, model) order (double-run byte-identical) plus CI-fail + isolation + jobs-guard tests, secrets + tach scans clean, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Corpus pilot with honest bias disclosure\n  Given 215/0 defect plus single-adjudicator limits\n  When corpus spike completes\n  Then report cites N>=100 post-dedup, both strata non-empty, per-source/stratum split, rubric, two-pass protocol + agreement usable as an I5 pilot input — with single-author bias explicitly NOT repaired (independent second rater remains an I5 trigger) — or names an explicit blocker (collection/license/CPU) with I5 plan"
      ],
      "title": "Semantic backend plus tracked cache infrastructure (no model)"
    },
    {
      "directionalInterfaces": [
        "Regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (tests/_golden.py:53) locally only (fails under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against shift reports; golden + tool counts together; no blind regen; no-op attestation with hash equality if all no-shift; ONLY regen-hatch writes tests/data/golden.",
        "Docs exact-strings checklist: semantic-justification.md contains 'DecisionBackend', '.python-setup-decisions.json', 'ADR-009', 'prompt-v1', 'veto', 'FakeBackend'; custom-checks.md contains 'DecisionBackend'; troubleshooting.md contains 'PYTHON_SETUP_LINT_DECISION_MODEL', 'PYTHON_SETUP_LINT_RERANKER_MODEL', 'deprecated'; AGENTS.md pipeline contains 'DecisionBackend' and no 'reranker' (case-insensitive) in that subsection, Tool Scope contains 'ruff format', Quick Commands integration row contains the --collect-only count plus 'passed' and 'skipped' split (9 collected; 9 passed with pre-commit env, 7 passed + 2 skipped without); CHANGELOG.md contains '[semantic]', 'no-go', '1.2.10', '.python-setup-decisions.json'; README.md contains 'v1.2.10'; config/ty.toml grep-zero 'sentence_transformers'; docs/adr/ADR-013..018 each contain 'Context', 'Decision', 'Consequences'.",
        "Final gate table: {format exit, lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD), pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist}; red cells route to new root/follow-up items, never baseline edits. Absolute green required at M5 only."
      ],
      "id": "M5",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given shift/no-shift declarations from all behavior items\n  When regen-hatch runs\n  Then golden hash-equal if all no-shift (no-op attestation), else regenerated locally with double-run plus key-by-key review matching shift reports, committed together",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When final validation completes\n  Then gate table records all cells plus docs exact-strings per checklist with absolute green (format exit 0, lint zero new, pytest/integration per contract, baseline [], golden hash or reviewed regen); any red cell fails with routing to follow-ups, never baseline edits"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect makes precision unevaluable and all repo labels single-author; GLiDE needs human review; CC-BY-NC excluded per allowlist; gliner2 py3.14 unverified.",
      "id": "U1",
      "spikeOutlines": [
        "brush-off-corpus-spike (fact-finder, report-only): two-pass real brush-off pilot (N>=100, both strata, rubric + agreement + splits; bias NOT fully repaired) for I5 bake-off; independent second rater still required in I5; no model choice in I4"
      ]
    },
    {
      "description": "Tracked-cache contract validation (root guard, encoding, sort key, prune, refresh shape, --path, jobs>1, placement, secrets fields) is spiked against the ADR-017/018 pinned contract; writer-first verdict must be consumed; verdict enum gates impls.",
      "id": "U2",
      "spikeOutlines": [
        "decision-cache-design-spike (poc on tmp, no committed files): validate ADR-017/018 contract + deterministic-given-cache+model proof with hash-asserted zero normal-lint writes; verdict feasible|blocked consumed by impls (no-op attestation on blocked)"
      ]
    },
    {
      "description": "Whether pylint-pyi companion-stub skip is fixed (with 205-symbol cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden and exposes large latent cleanup.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs orphan-only for I5"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Report-only, zero repo writes. At pinned clean HEAD (git status clean + SHA cited): git ls-files filtered to src+scripts+tests minus tests/data; recount universe total + per-owner counts from I2 map (67/83/15/4/15) within ±5; record commands + HEAD SHA + revision map-<short> consistently. Confirm exclusions existence (file:line only): _semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block. Confirm reservations absent at HEAD (or corrected). List root group once. Emit revised file-level single-writer table (dispatch owns __init__ after shim, LINT_TOOLS live registry preserved, no TOOLS-alias deletion; shim after baseline-merge; stale/prune 4+6 disjoint files; dispatch owns test_lint_runner.py; guards->semantic-tests and threshold-M2->M4 handoffs; backend owns joiner, legacy deps backend; cache-impl owns tach.toml + CLI threading) + drift list {path,auditRef,headEvidence,confirmed|corrected|disputed} (disputed allowed). Capture gate baseline (format, lint per-tool, pytest counts, integration 9-collected with env, golden hash, baseline []) + `uv run lint` check-only verification (git status clean) to confirm split-gate reunification or retain split. Informational, non-gating: no M2-M5 item depends on it; records red as red with follow-up routing (does not fail on red). M2-M4 items verify against this table (no new failures; red routes to follow-ups).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "scope-table-snapshot",
      "title": "Snapshot scope table and gate baseline (non-gating)"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Verify merged .secrets.baseline:42-44 ^\\.factory/ should_exclude_file list-pattern form against installed detect-secrets (cite version + should_exclude_file signature). Filtered scan = `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` on a clean checkout (fresh scratch clone at pinned HEAD SHA, no untracked): exits 0. Planted control secret (exact string, e.g. documented AWS example key): plant + git add inside the scratch clone (tracked-visibility required for git ls-files), scan (expect exit 1), then discard the clone so pinned HEAD stays clean; report exact plant/add/scan/remove steps for reviewer replication. Cite mechanism + version + HEAD, not counts. Journals stay committed; residual-risk caveat (write-time redaction + periodic unfiltered audits). No baseline edits. Feeds M5 gate table.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-scan-verification",
      "title": "Verify secrets exclusion mechanism"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (`from tests.checkers._factories import|from ._factories import`; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test_<method>_given_<condition>_then_<expected> + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-factories-split",
      "title": "Split checkers factories by domain"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/_factories_extras*.py + its importers ONLY, enumerated via grep at HEAD and reported; ~16 modules per pack, verify actual). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; no new failures vs M1 table; golden hash-equal; format-clean.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "runner-factories-trim",
      "title": "Trim runner factories extras below limit"
    },
    {
      "deps": [],
      "description": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "semantic-threshold-consolidation",
      "title": "Consolidate semantic heuristic tables"
    },
    {
      "deps": [],
      "description": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-semantic-guards",
      "title": "Guard heuristic checker tests with SEMANTIC=0"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "baseline-diff-merge",
      "title": "Merge baseline-diff test overlap"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 4 files (tests/runner/test_lint_runner_integration.py, tests/conftest.py, tests/runner/test_setup.py, tests/runner/test_setup_install.py); FORBIDDEN test_lint_runner.py (dispatch-split owns incl its :7 disable), test_autofix_conflict_integration.py + test_t9_7_compose_pyright_live.py + 4 self-lint files (prune owns). Red-test-exempt. Remove stale too-many-lines disables (recount lines at HEAD; 479/418 per pack, verify under-500); replace /home/slava paths (conftest.py:86, test_setup.py:252,277, test_setup_install.py:265-350, verify) with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; no new failures vs M1 table; golden hash-equal; grep zero hardcoded checkout in touched files.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "stale-disables-portability-cleanup",
      "title": "Remove stale disables and hardcoded paths"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 6 files wholly (tests/runner/test_self_lint_clean.py, test_config_consistency.py, test_pyright_noise_filter.py, test_runner_private_imports.py, test_t9_7_compose_pyright_live.py, test_autofix_conflict_integration.py); FORBIDDEN all other test files. Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); hardcoded paths inside owned files handled here (file deleted or path fixed); each removal names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept; a named default-collected survivor is allowed only if the report proves smoke itself violates never-test-linting. Keep golden/integration contracts. Verify: tests only; removal→survivor map in report; pytest (minus removed) + integration show no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "never-test-linting-prune",
      "title": "Prune gate-duplicating tests with survivors"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes, temp copies only. Reproduce: temp .pyi with companion .py (even broken -> skipped) vs orphan .pyi (linted, pyi-underscore fires); count golden 42/43 on .py (verify at HEAD); budget latent cleanup (205 private symbols in 29 stubs + duplicate-code findings, verify). Recommend fix-with-regen (temp-tree/copy or pylint mode + cleanup budget + regen plan for I5) vs document-orphan-only (scope note + stubtest governance). No prod change, no golden change in I4. Feeds I5 plan.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-pyi-scope-spike",
      "title": "Decide pylint-pyi companion-stub scope"
    },
    {
      "deps": [
        "runner-compat-shim-removal"
      ],
      "description": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 150,
      "slug": "runner-dispatch-split",
      "title": "Split dispatch registry below limits"
    },
    {
      "deps": [
        "baseline-diff-merge"
      ],
      "description": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 30,
      "slug": "runner-compat-shim-removal",
      "title": "Remove runner compat shims"
    },
    {
      "deps": [],
      "description": "Owns NEW checkers/_source_stream.py/.pyi + stream read/decode call sites in conformance/stub checkers ONLY; FORBIDDEN _base.py/.pyi (zero diff, semantic-owned), no_try_import register line/patterns (semantic), tests/data, baseline. API (all in _source_stream, @beartype, decode-if-bytes UTF-8 preserving current semantics — item reports exact bytes/str handling verified by tests; tach-clean; <=500 + .pyi): read_module_source(node)->str; is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates its local checker-bound helper to this, passing checker._coverage.patterns.source_roots; _base keeps its existing helper untouched — coexistence documented, future consolidation is backend follow-up); split_trailing_comment(line)->tuple[code, comment|None] adopted by suppression/bare-except trailing paths where mechanical (preceding-comment paths keep local logic unless identical — item reports which). Enumerate sites via grep `\\.stream\\(\\)` at HEAD (report full list; expect suppression/bare-except/stub families, verify) and replace all (grep zero copies outside helper). Verify: grep zero local copies; `git diff -- _base.py _base.pyi` empty; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 100,
      "slug": "checkers-stream-helper",
      "title": "Single-source stream read/decode helper"
    },
    {
      "deps": [
        "checkers-stream-helper",
        "decision-backend-impl",
        "runner-compat-shim-removal"
      ],
      "description": "Owns conformance/*.py (suppression, trivial_wrapper, bare_except, mixins) + stub fidelity rows ONLY; FORBIDDEN _base.py/.pyi incl stale doc (zero diff; backend-impl fixes _base.pyi), no_try_import register line/patterns, tests/data. Depends on decision-backend-impl for the joiner import contract: `from python_setup_lint.checkers._base import normalize_suppressed_codes` (pinned by backend-impl; this item does not implement join logic). Rename _legacy_scan -> _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21, verify at HEAD) with all call sites; remove trivial_wrapper dead _legacy_* unconditionally + peek line iff runner confirms deletion (else keep); delete astroid 3.x body[0].value branch (suppression_justification_checker.py:247-271, verify; floor astroid>=4.0.4); register() scope = conformance/*.py only, missing-beartype justification per ADR-012 (no @beartype added); mixin misc via shared typed base attempt with retain-and-report fallback; call joined-code emission via the imported helper (bare-except keeps single symbol). Fix .pyi fidelity rows. On shift: shift report + CHANGELOG snippet (root regenerates). Verify: grep zero _legacy_scan/_legacy_* (except retained peek if runner kept); no new failures vs M1 table; 51 heuristic outcomes pinned or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 40,
      "slug": "checkers-legacy-dead-cleanup",
      "title": "Rename legacy scan and remove dead compat"
    },
    {
      "deps": [],
      "description": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; `lint --refresh-decisions [--path ...]`; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "decision-cache-design-spike",
      "title": "Prototype tracked-cache schema and refresh"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Two-pass pilot for the I5 bake-off (single-author bias NOT fully repaired — downgraded honestly): collect N real repo suppressions + threshold 30+50 + brush-off/meaningful tables, DEDUPED by normalized justification (target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both strata non-empty); rubric (specific technical justification vs placeholder/deferral/brush-off). Rater protocol: pass 1 rates all items; pass 2 re-rates blinded (shuffled order, pass-1 labels hidden); disagreements resolved by a documented adjudication rule (disclose rule + edge-case rubric); report inter-rater agreement between the two passes. Terse borderlines re-rated. Per-source + per-stratum split. Recommend smallest-evaluable corpus + threshold sweep for I5 90/95/85 bars on accepted stratum, or explicit blocker (collection/license/CPU). I5 still requires an independent second rater before any go/no-go. No model choice in I4.",
      "escalate": true,
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "brush-off-corpus-spike",
      "title": "Build two-pass brush-off pilot sample"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "semantic-threshold-consolidation"
      ],
      "description": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 150,
      "slug": "decision-backend-impl",
      "title": "Implement veto DecisionBackend with FakeBackend"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "runner-compat-shim-removal",
        "runner-dispatch-split"
      ],
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py/.pyi + refresh threading (runner/cli.py --refresh-decisions branch + help text, runner/types.py RunnerConfig.refresh_decisions: bool = False field, runner/_cli_complexity.py _parse_config_args/_build_runner_config threading; --path scoping reuses existing --path plumbing) + tach.toml (sole owner: add decisions module depends_on=[] + checkers/runner depends_on=[decisions]) ONLY, applied onto final runner shape after dispatch split; FORBIDDEN _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-017 contract as validated by spike (array sorted by (rule, justification, model), indent2 sort_keys; entry + {version, prompt hash, last-seen}; secrets-clean encoding; read-only lint hash-asserted zero writes; explicit refresh lockfile + merge + atomic replace in target dir with DECISIONS_PATH test-only isolation; prune auto missing/stale; --path scoping; jobs==1 required else loud fail; CI-fail). Must pass all tools incl detect-secrets and tach check. Existing gate contracts unchanged. Verify: tmp round-trip; zero-writes hash; refresh merges + prunes + sorts deterministically (double-run byte-identical); CI-fail + isolation + jobs-guard tests; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 120,
      "slug": "decision-cache-impl",
      "title": "Implement tracked decision cache and refresh"
    },
    {
      "deps": [
        "checkers-semantic-guards",
        "decision-backend-impl",
        "decision-cache-impl",
        "semantic-threshold-consolidation"
      ],
      "description": "Second writer (after M2 handoffs): threshold 2 files (preserve M2 deduped table; rewrite reranker classes only) + suppression-file pipeline block (after guards) + tests/assumptions runtime/decision/cache modules (append-only; deliberate cache-semantics rewrite, not loosened; never touch root __init__ + astroid/beartype/pylint contracts) + semantic-justification.md + custom-checks bullet + troubleshooting section + docs/adr/ADR-014.md + ADR-016.md ONLY; FORBIDDEN AGENTS.md/CHANGELOG.md (snippet in report; docs writes file), tests/data, src. Merge tables pinned (preserved); FakeBackend kwarg + env; cache tmp + hypothesis format incl sort-key determinism; delete vacuous + ImportError-propagation; 4 pair tests (test_semantic_check.py:432,453,473,493, verify): deleted iff the class imports/calls sentence-transformers or _load_reranker/_reset_cache (reranker-coupled), else marked slow; full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs. Modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model). Docs state veto + cache + no-go; ADRs carry Context/Decision/Consequences + pinned values. Verify: no new failures vs M1 table; golden hash-equal or shift-reported; rumdl clean.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "semantic-tests-rewrite",
      "title": "Rewrite semantic tests and docs (no AGENTS)"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-legacy-dead-cleanup",
        "checkers-semantic-guards",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "never-test-linting-prune",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Sole AGENTS.md + CHANGELOG.md + README.md + config/ty.toml + docs/adr/ADR-013.md + ADR-015.md writer in I4 (after all M2 counts-affecting items + M3 registry/behavior items + M4 backend/cache/tests); FORBIDDEN semantic-justification/custom-checks/troubleshooting/ADR-014/016 (semantic-tests), tach.toml (cache-impl), tests/data, src except ty.toml comment. AGENTS counts from rerun actuals (verify --collect-only + TOOLS==14 + 9-collected contract) + Tool Scope ruff-format row + pipeline subsection (DecisionBackend, no reranker) + testing strategy; CHANGELOG user-visible (extra contents, new/deprecated vars incl full PYTHON_SETUP_LINT_DECISION_MODEL name, cache file, no-go note + version 1.2.10); README v1.2.10 pin; ty.toml remove sentence_transformers; ADRs full Context/Decision/Consequences. Verify: docs-only diff; exact-strings grep per M5 checklist (incl ADR-013..016 Context/Decision/Consequences); rumdl clean; no new failures vs M1 table.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "docs-reconciliation",
      "title": "Reconcile docs counts and versions"
    },
    {
      "deps": [
        "checkers-legacy-dead-cleanup",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "semantic-tests-rewrite"
      ],
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items: run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (tests/_golden.py:53; never under CI/GITHUB_ACTIONS — guard fails), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on shift reports"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-semantic-guards",
        "docs-reconciliation",
        "golden-regen-hatch",
        "never-test-linting-prune",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Report-only, zero writes. Record final gate table: format exit 0; lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD); pytest counts; integration 9-collected-0-failed with pre-commit env pinned; golden hash or regen diff; baseline []; docs exact-strings per M5 checklist. Red-cell routing to new root/follow-up items, never baseline edits. Absolute green is required here (M5 only); red cells fail the gate with routing. Feeds close-up.",
      "kind": "fact-finder",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material (dormant path). Tightening intentional when a model ships.",
      "disposition": "confirm with human",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits. Real-model tests are slow + with_real_api, never in default suite.",
      "why": "Matches current venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator secrets answers stand: journals committed; ^\\.factory/ filter merged; harness filter-seeding outside task; acceptance cites mechanism + HEAD.",
      "why": "Steering directive 1794158471467."
    },
    {
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without). AGENTS.md reconciled to this contract.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
    },
    {
      "assumption": "Iteration 4 ships semantic infra only (backend/cache/FakeBackend/docs/corpus pilot); model swap NOT complete at close-up and must not be claimed. I5 triggers: two-pass pilot + independent second rater repairing 215/0, human Fastino decision if GLiDE recommended, CPU latency/RSS benchmark.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating extended by ADR-016; operator must approve infra-only close-up."
    },
    {
      "assumption": "No child epics in iteration 4; all work as 22 root items within the 50-item cap, with file-level single-writer + dep serialization (ADR-013).",
      "why": "I3 epic gate caused 3 empty waves + zero M2 delivery; direct increments avoid bottleneck."
    },
    {
      "assumption": "Model license allowlist: Apache-2.0 / MIT / BSD-2/3-Clause allowed; CC-BY-NC-4.0 and other non-commercial excluded; Fastino Community + unclear/no-license flagged for human review; no model ships without a license verdict.",
      "disposition": "confirm with human",
      "why": "MIT tool cannot absorb non-commercial/unclear model licensing; I5 bake-off needs the gating criterion before any verdict."
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "id": "TD4-B1",
      "resolution": "ADR-009 extended by ADR-016: no model in I4; brush-off-corpus-spike produces a two-pass pilot + rubric + agreement (bias NOT fully repaired); I5 bake-off additionally requires an independent second rater; backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "category": "blocking",
      "description": "I3 M1 gate not closed per engine (map running, kickoff pending) caused 3 empty waves.",
      "id": "TD4-B2",
      "resolution": "ADR-013 abandons epic gate for I4; scope-table-snapshot informational non-gating; closeup-3 verified repo scope carries forward; M2-M5 proceed via file ownership + deps; M2-M4 verify relative to the M1 table, absolute green enforced only at M5."
    },
    {
      "category": "blocking",
      "description": "Cache refresh/root/prune/secrets unresolved (Q4-7); writer-first verdict must be consumed, not invented; blocks M4 backend/cache impls.",
      "id": "TD4-B3",
      "resolution": "ADR-017 pins the refresh contract (+ADR-018 placement); decision-cache-design-spike validates it on tmp with verdict enum (feasible + 4 proofs, or blocked with I5 plan); backend/cache impls consume verdict via deps (no-op attestation on blocked) and rewrite assumption file deliberately."
    },
    {
      "category": "impacting",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, 205 latent private symbols, companion stubs unenforced).",
      "id": "TD4-I1",
      "resolution": "pylint-pyi-scope-spike reproduces + recommends fix-with-regen vs orphan-only with budget; fix + golden regen deferred to I5; I4 golden unchanged on this axis."
    },
    {
      "category": "adjacent",
      "description": "Docs/version drift (AGENTS stale counts/scope/pipeline, CHANGELOG 1.2.9 vs 1.2.10, README v1.2.5 pin, ty.toml sentence_transformers, ADR-013..018 stubs, legacy .gitignore .cache lines retained intentionally).",
      "id": "TD4-A1",
      "resolution": "docs-reconciliation sole AGENTS/CHANGELOG/version/pin/ty.toml/ADR-013/015 writer in I4 (after M2 + M3 + backend/cache/tests); semantic-tests owns non-AGENTS semantic docs + ADR-014/016 and emits CHANGELOG snippet in report; cache-impl owns tach.toml; .gitignore legacy lines kept by design (.cache still ignored; decisions file committed)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules/shims/duplicates/hardcoded paths (dispatch 542, _factories 1393, _factories_extras 511 + dup disables, test_semantic 506, baseline shims, stream blocks, mixin misc, trivial-wrapper disables, /home/slava paths) + _base/_source_stream _is_under_source_root coexistence.",
      "id": "TD4-A2",
      "resolution": "Split across M2-M3 items per evidence with disjoint files + handoff deps; each removal/merge names survivor; default pipeline pin retained; register() per ADR-012, mixin per attempt-with-fallback; _source_stream helper is canonical for checker call sites going forward, _base keeps its existing helper (zero-diff constraint) with future consolidation as backend follow-up."
    }
  ],
  "adrs": [
    {
      "consequences": "No epic close-ups/handoff in I4; M5 regen consumes item shift declarations directly. 13 dep-free wave-1 items avoid empty waves. Parallel same-file is forbidden; sequential same-file is permitted only via explicit deps with pinned handoff order (guards->semantic-tests, threshold-M2->threshold-M4, baseline-merge->shim->dispatch, backend->legacy-joiner). I5 may reintroduce epics or continue root increments.",
      "context": "I3 planned 3 epics behind map-revalidation + kickoff gate; map stalled (retry + 3 empty waves, Blocked none), kickoff pending, M2 zero delivery per closeup-3. Map + kickoff reports live in orchestration records with high QA surface on report-only items, creating a single-item bottleneck. Review further requires file-level proof for parallel items.",
      "decision": "Iteration 4 ships no child epics; all work as root items with file-level single-writer for parallel items plus dep serialization for handoffs (dispatch/baseline/parsers/__init__ chain, checkers stream->legacy, threshold-M2->backend/M4, guards->semantic-tests, baseline-merge->shim, backend-joiner->legacy, factories/threshold/guards/baseline/portability/prune disjoint, AGENTS/CHANGELOG, golden). Scope-table-snapshot is informational, non-gating. M2-M5 proceed without map-revision gate.",
      "id": "ADR-013",
      "title": "Root-serialized delivery replaces epic decomposition for iteration 4"
    },
    {
      "consequences": "Brush-off rejections guaranteed regardless of model; model only tightens acceptance; SEMANTIC=0 deterministic contract preserved; threshold continuity with current 0.5; single joiner implementation shared by extraction and matching; backend/cache tests assert veto (brush-off uncalled, one call per unique pair, hit without load, no retry storm, warnings once).",
      "context": "ADR-010 says heuristic-first hard gate but current code is semantic-first with heuristic fallback (_base.py:150-158 vs _semantic.py:1-12). Open Q1 asks gate meaning, float vs bool, None mapping. Review requires pinned threshold, kwarg placement, None mapping, joiner ownership, Fake values, warning channel, extra shape, full env names.",
      "decision": "Veto: final = heuristic(text) AND (backend.decide(...)>=DECISION_THRESHOLD) when backend available, else heuristic. DECISION_THRESHOLD=0.5, PROMPT_VERSION='prompt-v1'. Backward-compat optional kwarg backend: DecisionBackend|None=None (keyword-only, public in .pyi) on BOTH check_if_meaningful and semantic_check_if_meaningful; existing 5 call sites unchanged. None mapping: loader/backend None -> heuristic stands; semantic_check preserves bool|None for direct callers, check_if_meaningful always returns bool. Joined rule owned solely by decision-backend-impl as normalize_suppressed_codes(raw)->str in _base.py (+.pyi): strip, drop empties, dedupe, ASCII-sort, join ',' (no spaces); echo matches if primary_lower equals any element_lower; bare-except keeps single symbol; legacy-cleanup imports it (dep edge backend->legacy). FakeBackend.decide returns 1.0; Fake model string 'fake-backend rev test prompt-v1' (no bare hex>=20). Warnings via structlog warning event 'decision_model_unavailable' (model + reason fields) once per process via sentinel; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warns once per process; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader returns None + exactly-one warning in I4. No retry storm. [semantic] extra retained as empty placeholder (no dependencies) with comment; uv.lock regenerated with zero sentence-transformers edge for the extra. Cache key (justification,rule,model); context is model-input only.",
      "id": "ADR-014",
      "title": "Heuristic-first veto semantics for DecisionBackend (pinned values)"
    },
    {
      "consequences": "'Coding rules enforced' not overstated in I4; golden stable on this axis; I5 plan consumes spike verdict with explicit budget.",
      "context": "_PylintPyiLintTool passes .pyi paths but pylint skips companion stubs (even broken) and lints orphan only; golden 42/43 pyi findings on .py; probe finds 205 latent private stub symbols; fixing changes golden + exposes large cleanup, conflicting with preservation unless staged.",
      "decision": "I4 runs pylint-pyi-scope-spike only (reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs document-orphan-only). No prod change, no golden change on this axis in I4. Fix + regen (if recommended) scheduled in I5.",
      "id": "ADR-015",
      "title": "Pylint-pyi scope decided by spike, fix deferred to iteration 5"
    },
    {
      "consequences": "Intent swap clause remains open after I4; infra makes I5 wiring bounded (get_backend + PYTHON_SETUP_LINT_DECISION_MODEL, no pipeline refactor); gates stay offline/fast/deterministic.",
      "context": "ADR-009 deferred model on 215/0 structural no-go + single-adjudicator limits + Fastino review + no CPU bench. At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled. Two-pass pilot + independent-rater + license + CPU bench still open.",
      "decision": "I4 lands model-independent infra only (veto backend + tracked cache + FakeBackend/NoBackend + packaging swap to no-model + tests/docs + corpus pilot). No model wiring, no real-model default test; exactly one slow+with_real_api e2e SKELETON is required and skipped until a model ships. Model bake-off + wiring gated on I4 corpus pilot + independent second rater + human Fastino decision + CPU bench in I5. Close-up must not claim swap complete.",
      "id": "ADR-016",
      "title": "Iteration-4 semantic scope remains infrastructure-only"
    },
    {
      "consequences": "Single refresh contract for spike validation + impl; no setup-subcommand alternative; CI-safe; test isolation mirrors backend guard; jobs>1 fails loudly instead of silent corruption; deterministic serialization provable via pinned sort key. If spike proves infeasible, it reports verdict blocked and impls merge no-op attestations (must not invent alternative).",
      "context": "ADR-010 requires explicit CI-guarded refresh with lockfile + merge + atomic replace, but invocation shape (lint flag vs setup subcommand vs env sidecar), CI direction, DECISIONS_PATH scope, array sort key, verdict consumption, files cardinality/merge, prune auto-vs-flag, --path scoping, and jobs>1 behavior are unspecified (open Q5-7). Pylint runs as subprocess so verdicts are invisible to runner.",
      "decision": "Refresh invocation is `lint --refresh-decisions [--path ...]` (runner CLI flag; setup-subcommand alternative rejected). Refresh FAILS under CI/GITHUB_ACTIONS (exit non-zero, same guard shape as golden UPDATE_ENV). PYTHON_SETUP_LINT_DECISIONS_PATH is test-only, honored ONLY under PYTEST_CURRENT_TEST; production root is config.cwd with traversal guard (resolved cache path must stay within cwd, no parent escape, no absolute outside). Tracked array is sorted by (rule, justification, model) tuple; object keys use sort_keys. files = sorted unique POSIX relpaths, union-merged on refresh; prune is automatic on refresh for missing files + stale model-id entries (no --prune flag in I4). --path scopes the sweep (entries for unscanned files retained). Refresh requires pylint jobs==1 and fails loudly otherwise (no sidecars in I4). Spike verdict enum: {verdict: feasible|blocked; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it}.",
      "id": "ADR-017",
      "title": "Decision-cache refresh contract (lint flag, CI-fail, test-only isolation)"
    },
    {
      "consequences": "tach check verifies the new boundary; no import duplication; runner/checkers never import each other; tach.toml gains exactly one module + two depends_on edges, owned by a single item.",
      "context": "tach.toml declares both checkers and runner with depends_on=[]. The tracked cache needs cross-module use: runner CLI (refresh write path) and checkers _base/_semantic (read path). Either placement direction violates one empty depends_on; lazy imports are still static imports to tach; no item owned tach.toml so 'tach-clean' was unverifiable.",
      "decision": "Place the cache in a new third module python_setup_lint/decisions/ (file _decision_cache.py +.pyi); checkers and runner both declare depends_on=['python_setup_lint.decisions']; decisions itself depends on nothing. decision-cache-impl solely owns tach.toml in I4 (config exception alongside the refresh threading). _decision_backend.py stays in checkers (imported only by _base/_semantic). The design spike validates this placement; semantic-tests-rewrite uses the decisions import path.",
      "id": "ADR-018",
      "title": "Decision-cache placement in a shared decisions module"
    }
  ]
}`. NEVER invent items or guess outlines — an unknown `outlineRef` fails validation.
- Item fields: for each planned item, specify `slug`, `kind`, `title`, `assignment`, `outlineRef`, `milestone`, `wave`, `deps`, `scenarioRefs`, and `citations`.
- Kinds selection: assign item kinds using the guides below (`dev`, `no-behavior`, `test-only`, `fact-finder`, `poc`, `test-assumptions`, `simple`, `epic` where allowed).
- Wave scheduling:
  - Items in wave W may ONLY depend on items scheduled in waves < W. Intra-wave dependencies are strictly invalid.
  - Concurrency: schedule at most `maxParallelItems` items per wave (see `{
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
}` for the value).
  - Total items: stay within `maxItemsPerPlan` (see `{
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
}`).
- Citation scoping: include only the specific subset of codebase citations required for each item's assignment. Never attach irrelevant task citations.
- Outline linkage: map each item to its plan outline via `outlineRef`. Inherit `escalate` flags from outlines.
- Output: yield structured output matching `plan-edits.schema.json`.

## Plan
{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "Scope table: {path, owner in {runner,checkers,semantic,root}, single-writer item slug} at pinned clean HEAD; universe src+scripts+tests minus tests/data; root group (tests/data, config, docs except assigned rows, repo-root except packaging exception); exclusions (_semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block); planned paths (checkers/_decision_backend, decisions/_decision_cache per ADR-018, conftest reservation); artifact = item report, informational, non-gating.",
        "Gate baseline table: {format exit, lint per-tool, pytest counts, integration 9-collected with pre-commit env, golden hash, baseline []} + `uv run lint` check-only verification (git status clean) confirming split-gate reunification or retaining split; red recorded as red with follow-up routing (non-gating record, does not fail on red). M2-M4 items verify against this table.",
        "Secrets verification: filtered scan `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` with ^\\.factory/ filter (.secrets.baseline:42-44 list-pattern; version + should_exclude_file signature cited) exits 0 on clean checkout (fresh scratch clone at pinned HEAD); planted control secret (planted + git-added in scratch clone, exact string in report, clone discarded after) exits 1; journals committed."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Scope snapshot without gating\n  Given a pinned clean HEAD (git status clean + SHA cited)\n  When scope-table-snapshot runs\n  Then every universe file lists owner + single-writer item, exclusions reference existing symbols, reservations name planned paths only, and M2-M5 proceed without depending on it",
        "Scenario: Secrets mechanism verified\n  Given the merged ^\\.factory/ filter\n  When the filtered scan runs on a clean checkout plus a git-added planted control secret in a scratch clone\n  Then clean exits 0, planted exits 1, cited with filter + version + HEAD, and the scratch clone is discarded",
        "Scenario: Gates baseline recorded with red handling\n  Given a clean HEAD\n  When gate capture runs format + lint + pytest + integration\n  Then the table records exits/counts/hashes, baseline [], golden hash, and lint check-only verdict; red cells are recorded with follow-up routing and the item still passes as a non-gating record"
      ],
      "title": "Kickoff and green-gate preconditions (non-blocking)"
    },
    {
      "directionalInterfaces": [
        "Checkers factories split: tests/checkers/_factories*.py each <=500, no too-many-lines, ParameterSet typing, all importers (recounted via grep at HEAD; 8 families per review, verify) migrated, behavior identical; touched files toward naming/marker conventions.",
        "Runner factories trim: tests/runner/_factories_extras*.py each <=500, duplicate disables collapsed to <=1, importers (enumerated via grep) migrated, behavior identical.",
        "Threshold consolidation: one deduped parametrized table (lists recounted at HEAD; outcomes pinned), modules <=500, no suppressions; preserved by M4 (handoff).",
        "SEMANTIC guards: all heuristic tests in both checker files (recounted at HEAD; 40+11 per pack) pass with monkeypatched SEMANTIC=0, outcomes pinned; pipeline block left for M4 handoff.",
        "Baseline merge: baseline-diff coverage in <=2 modules <=500, overlapping cases merged, each names survivor; pinning limbs preserved or flagged; shim serializes after.",
        "Portability (4 files only): stale disables removed, /home/slava paths replaced via tmp/env, stale comments fixed; forbids prune-owned 6 + dispatch-owned test_lint_runner.py.",
        "Never-test-linting prune (6 files only): each removed group names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept (survivor allowed only if the report proves smoke itself violates never-test-linting); golden/integration contracts kept."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Factories split without behavior change\n  Given over-limit factories\n  When splits merge\n  Then each module <=500 with no disable (grep zero too-many-lines), importers pass, no new failures vs M1 baseline table (exits/counts cited), golden hash-equal",
        "Scenario: Threshold deduped plus guards pinned\n  Given overlapping tables plus unguarded heuristic tests\n  When consolidation plus guards merge\n  Then one table pins exact outcomes (parametrized IDs + outcomes in report), all heuristic tests pass with SEMANTIC=0, no new failures vs M1 table, golden hash-equal",
        "Scenario: Baseline merged with survivors\n  Given overlapping baseline tests\n  When merge completes\n  Then <=2 modules <=500, each merged case names its survivor, pinning limbs preserved or flagged as blocking debt, no new failures vs M1 table, golden hash-equal",
        "Scenario: Portability cleaned in owned files\n  Given stale disables plus hardcoded paths\n  When cleanup merges\n  Then disables removed (grep zero in touched files), hardcoded checkout paths gone (grep zero in touched files), no new failures vs M1 table, golden hash-equal",
        "Scenario: Gate-duplicating tests pruned with pin retained\n  Given self-lint groups\n  When prune merges\n  Then each removal names its survivor in a removal→survivor map, the default pin (test_real_pipeline_smoke.py kept, or a survivor only if smoke itself violates the boundary) is default-collected, golden/integration contracts kept, no new failures vs M1 table"
      ],
      "title": "Test infrastructure debloat first"
    },
    {
      "directionalInterfaces": [
        "Dispatch split (after shim): runner/dispatch*.py each <=500, zero too-many-lines; TOOLS stays the frozen canonical built-in list, LINT_TOOLS the live mutable registry (mutation semantics preserved for register_lint_tool and its consumers); EXPECTED_TOOL_NAMES keeps deriving from TOOLS; all public names single-sourced re-exported through runner/__init__.py (sole __init__ writer; removes peek lines :17/:22/:62 iff shim deleted); FORMATTER_ONLY/RECORDLESS explicit; registry tests (test_lint_runner incl :7 disable, stats, t3, fakes) pass.",
        "Shim removal (after baseline-merge): baseline _FALLBACK_TOOLS/peek/_compare_sorted plus parsers re-exports deleted (grep zero) or kept with in-repo consumer evidence (file:line citations) + debt note; asserting tests (enumerated via grep) updated; does not touch __init__/dispatch.",
        "Stream helper: NEW checkers/_source_stream.py/.pyi exposing read_module_source(node)->str, is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates to it; _base helper untouched — coexistence documented), and split_trailing_comment(line)->(code, comment|None) for trailing paths where mechanical (@beartype, decode-if-bytes UTF-8 preserving current semantics, tach-clean, <=500); all grep-enumerated `\\.stream\\(\\)` sites replaced (grep zero copies outside helper); zero _base.py/.pyi diff.",
        "Legacy cleanup (after backend for joiner): _legacy_scan renamed to _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21) with call sites; trivial_wrapper dead _legacy_* removed plus peek line matching runner close-up (deleted iff runner deleted, else kept); astroid 3.x body[0].value branch (:247-271) deleted; register() scope = conformance/*.py only per ADR-012 (no @beartype); mixin misc removed or retained-with-justification + blocker; joined codes emitted via imported normalize_suppressed_codes (bare-except single); skips no_try_import register line; shift report {class, keys, snippet, file:line} if outcomes shift.",
        "Pyi spike verdict: {reproduction, golden counts, latent budget (205 symbols + duplicate-code), recommendation fix-with-regen vs document-orphan-only, I5 plan} — report only, no I4 code or golden change."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Runner split without drift\n  Given dispatch 542 plus shims\n  When splits merge in shim->dispatch order\n  Then modules <=500 with no disables (grep zero), registry single-sourced with live LINT_TOOLS semantics preserved (registry tests pass), shims deleted (grep zero shim symbols) or kept with consumer evidence + debt note (report cites file:line), no new failures vs M1 table, golden hash-equal or shift-reported ({class, keys, snippet, file:line})",
        "Scenario: Checkers helper plus legacy without drift\n  Given duplicated stream blocks plus legacy names plus dead code\n  When helper plus cleanup merge (legacy after backend joiner)\n  Then zero copies outside helper (grep zero), zero _base diff (`git diff -- _base.py _base.pyi` empty), joined codes emitted via the shared helper, 51 heuristic outcomes pinned or shift-reported, no new failures vs M1 table",
        "Scenario: Pyi scope decided without code change\n  Given companion-stub blind spot\n  When spike completes\n  Then verdict recommends fix (with I5 budget + regen plan) or orphan-only (with docs note), no I4 golden change"
      ],
      "title": "Production rule enforcement and code debloat"
    },
    {
      "directionalInterfaces": [
        "Backend (ADR-014 pinned): DecisionBackend Protocol decide(justification,rule,context)->float [0,1]; DECISION_THRESHOLD=0.5 + PROMPT_VERSION='prompt-v1'; veto final = heuristic AND (prob>=0.5) when available else heuristic; check_if_meaningful signature preserved + optional kwarg backend=None (public .pyi) on both fns; SEMANTIC='0' preserved; semantic_check bool|None preserved for direct callers (loader None -> heuristic stands; check_if_meaningful always bool); normalize_suppressed_codes(raw)->str in _base (+.pyi) single-owns join/sort/match; test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY under PYTEST_CURRENT_TEST (loader pins both); FakeBackend 1.0/NoBackend/get_backend; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one structlog warning; [semantic] empty placeholder (uv.lock zero edge); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warn+ignore once per process; tach-clean, @beartype, structlog, each <=500; .gitignore untouched (legacy .cache intentional), no hatch entry; stale _base.pyi rule/context doc fixed.",
        "Cache (ADR-017/018): python_setup_lint/decisions/_decision_cache.py (+.pyi) at linted root .python-setup-decisions.json (array sorted by (rule, justification, model), indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized, rule joined, model '<id> rev <short12> prompt-vN', decision, files sorted unique POSIX} + {version, prompt hash, last-seen}; key (justification,rule,model); read-only lint (hash-asserted zero writes); `lint --refresh-decisions [--path ...]` explicit refresh (RunnerConfig.refresh_decisions threading via _cli_complexity + cli.py; lockfile + merge + atomic replace in target dir, DECISIONS_PATH test-only isolation, CI-fail under CI/GITHUB_ACTIONS); prune automatic missing/stale; --path scoping (unscanned retained); jobs==1 required else loud fail; tach.toml adds decisions module + edges.",
        "Spike verdict (consumed, not advisory): {verdict: feasible|blocked}; feasible carries every ADR-017/018 field + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and backend/cache impls merge no-op attestations citing it.",
        "Tests (no AGENTS): M2 deduped table preserved (reranker classes rewritten only); FakeBackend kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format incl sort-key determinism (double-run byte-identical); vacuous + ImportError-propagation deleted; 4 pair tests (:432,453,473,493) deleted iff reranker-coupled (imports/calls sentence-transformers or _load_reranker/_reset_cache), else marked slow; pipeline block after guards; cache-semantics assumptions rewritten deliberately; modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model); full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs; CHANGELOG snippet in report only; ADR-014/016 full Context/Decision/Consequences with pinned values.",
        "Corpus pilot: two-pass real brush-off sample (N>=100 post-dedup, both strata non-empty, rubric + per-source/stratum split, pass-1 + blinded pass-2 + documented adjudication + agreement disclosed, terse borderlines re-rated); single-author bias NOT fully repaired — I5 still requires an independent second rater; or explicit I5 blocker (collection/license/CPU); report only."
      ],
      "id": "M4",
      "scenarios": [
        "Scenario: Veto backend without model\n  Given ADR-009 no-go\n  When backend merges (or no-op attests on blocked verdict)\n  Then brush-off never reaches backend (uncalled asserted), one call per unique pair, cache-hit without model emits persisted verdict with no load, no retry storm (one warning asserted), Fake 1.0 + threshold 0.5 applied, SEMANTIC=0 hash-equals golden, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Cache read-only plus explicit refresh\n  Given tracked schema per ADR-017/018\n  When cache merges (or no-op attests on blocked verdict)\n  Then normal lint shows zero writes by hash, `lint --refresh-decisions` on tmp merges + prunes + atomic-replaces with deterministic (rule, justification, model) order (double-run byte-identical) plus CI-fail + isolation + jobs-guard tests, secrets + tach scans clean, no new failures vs M1 table — or a no-op attestation citing the spike blocker",
        "Scenario: Corpus pilot with honest bias disclosure\n  Given 215/0 defect plus single-adjudicator limits\n  When corpus spike completes\n  Then report cites N>=100 post-dedup, both strata non-empty, per-source/stratum split, rubric, two-pass protocol + agreement usable as an I5 pilot input — with single-author bias explicitly NOT repaired (independent second rater remains an I5 trigger) — or names an explicit blocker (collection/license/CPU) with I5 plan"
      ],
      "title": "Semantic backend plus tracked cache infrastructure (no model)"
    },
    {
      "directionalInterfaces": [
        "Regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (tests/_golden.py:53) locally only (fails under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against shift reports; golden + tool counts together; no blind regen; no-op attestation with hash equality if all no-shift; ONLY regen-hatch writes tests/data/golden.",
        "Docs exact-strings checklist: semantic-justification.md contains 'DecisionBackend', '.python-setup-decisions.json', 'ADR-009', 'prompt-v1', 'veto', 'FakeBackend'; custom-checks.md contains 'DecisionBackend'; troubleshooting.md contains 'PYTHON_SETUP_LINT_DECISION_MODEL', 'PYTHON_SETUP_LINT_RERANKER_MODEL', 'deprecated'; AGENTS.md pipeline contains 'DecisionBackend' and no 'reranker' (case-insensitive) in that subsection, Tool Scope contains 'ruff format', Quick Commands integration row contains the --collect-only count plus 'passed' and 'skipped' split (9 collected; 9 passed with pre-commit env, 7 passed + 2 skipped without); CHANGELOG.md contains '[semantic]', 'no-go', '1.2.10', '.python-setup-decisions.json'; README.md contains 'v1.2.10'; config/ty.toml grep-zero 'sentence_transformers'; docs/adr/ADR-013..018 each contain 'Context', 'Decision', 'Consequences'.",
        "Final gate table: {format exit, lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD), pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist}; red cells route to new root/follow-up items, never baseline edits. Absolute green required at M5 only."
      ],
      "id": "M5",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given shift/no-shift declarations from all behavior items\n  When regen-hatch runs\n  Then golden hash-equal if all no-shift (no-op attestation), else regenerated locally with double-run plus key-by-key review matching shift reports, committed together",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When final validation completes\n  Then gate table records all cells plus docs exact-strings per checklist with absolute green (format exit 0, lint zero new, pytest/integration per contract, baseline [], golden hash or reviewed regen); any red cell fails with routing to follow-ups, never baseline edits"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect makes precision unevaluable and all repo labels single-author; GLiDE needs human review; CC-BY-NC excluded per allowlist; gliner2 py3.14 unverified.",
      "id": "U1",
      "spikeOutlines": [
        "brush-off-corpus-spike (fact-finder, report-only): two-pass real brush-off pilot (N>=100, both strata, rubric + agreement + splits; bias NOT fully repaired) for I5 bake-off; independent second rater still required in I5; no model choice in I4"
      ]
    },
    {
      "description": "Tracked-cache contract validation (root guard, encoding, sort key, prune, refresh shape, --path, jobs>1, placement, secrets fields) is spiked against the ADR-017/018 pinned contract; writer-first verdict must be consumed; verdict enum gates impls.",
      "id": "U2",
      "spikeOutlines": [
        "decision-cache-design-spike (poc on tmp, no committed files): validate ADR-017/018 contract + deterministic-given-cache+model proof with hash-asserted zero normal-lint writes; verdict feasible|blocked consumed by impls (no-op attestation on blocked)"
      ]
    },
    {
      "description": "Whether pylint-pyi companion-stub skip is fixed (with 205-symbol cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden and exposes large latent cleanup.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs orphan-only for I5"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Report-only, zero repo writes. At pinned clean HEAD (git status clean + SHA cited): git ls-files filtered to src+scripts+tests minus tests/data; recount universe total + per-owner counts from I2 map (67/83/15/4/15) within ±5; record commands + HEAD SHA + revision map-<short> consistently. Confirm exclusions existence (file:line only): _semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block. Confirm reservations absent at HEAD (or corrected). List root group once. Emit revised file-level single-writer table (dispatch owns __init__ after shim, LINT_TOOLS live registry preserved, no TOOLS-alias deletion; shim after baseline-merge; stale/prune 4+6 disjoint files; dispatch owns test_lint_runner.py; guards->semantic-tests and threshold-M2->M4 handoffs; backend owns joiner, legacy deps backend; cache-impl owns tach.toml + CLI threading) + drift list {path,auditRef,headEvidence,confirmed|corrected|disputed} (disputed allowed). Capture gate baseline (format, lint per-tool, pytest counts, integration 9-collected with env, golden hash, baseline []) + `uv run lint` check-only verification (git status clean) to confirm split-gate reunification or retain split. Informational, non-gating: no M2-M5 item depends on it; records red as red with follow-up routing (does not fail on red). M2-M4 items verify against this table (no new failures; red routes to follow-ups).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "scope-table-snapshot",
      "title": "Snapshot scope table and gate baseline (non-gating)"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Verify merged .secrets.baseline:42-44 ^\\.factory/ should_exclude_file list-pattern form against installed detect-secrets (cite version + should_exclude_file signature). Filtered scan = `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline` on a clean checkout (fresh scratch clone at pinned HEAD SHA, no untracked): exits 0. Planted control secret (exact string, e.g. documented AWS example key): plant + git add inside the scratch clone (tracked-visibility required for git ls-files), scan (expect exit 1), then discard the clone so pinned HEAD stays clean; report exact plant/add/scan/remove steps for reviewer replication. Cite mechanism + version + HEAD, not counts. Journals stay committed; residual-risk caveat (write-time redaction + periodic unfiltered audits). No baseline edits. Feeds M5 gate table.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-scan-verification",
      "title": "Verify secrets exclusion mechanism"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/checkers/_factories*.py + importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Recount importers at HEAD via grep (`from tests.checkers._factories import|from ._factories import`; reviewer names 8 families: beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer — item reports actual paths, 8 vs 9 resolved by recount). Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate all importers; delete unused helpers with survivor notes; touched files toward test_<method>_given_<condition>_then_<expected> + no_external_api/with_real_api markers. Verify: tests only; no new failures vs M1 table (exits/counts cited); golden hash-equal; format-clean; grep zero too-many-lines in split.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-factories-split",
      "title": "Split checkers factories by domain"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/_factories_extras*.py + its importers ONLY, enumerated via grep at HEAD and reported; ~16 modules per pack, verify actual). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; no new failures vs M1 table; golden hash-equal; format-clean.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "runner-factories-trim",
      "title": "Trim runner factories extras below limit"
    },
    {
      "deps": [],
      "description": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Recount lists at HEAD (30/33 + 50 + 35 per pack, verify actual overlaps) then merge into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched; modules <=500 with no suppressions; fix stale 504-vs-506 header. M4 preserves this deduped table (handoff via deps; M4 rewrites reranker classes only, must not discard dedup). Verify: tests only; parametrized IDs + outcomes identical in report; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "semantic-threshold-consolidation",
      "title": "Consolidate semantic heuristic tables"
    },
    {
      "deps": [],
      "description": "Tests-only, first writer of 2 files wholly (test_suppression_justification_checker.py + test_bare_except_comment_checker.py). Red-test-exempt. Recount heuristic tests at HEAD (40 W9704 + 11 W9738 per pack, verify) then add monkeypatched SEMANTIC=0 guards to all heuristic tests; leave TestSuppressionRerankerPipeline block untouched for M4 second writer (serialized via dep on this item, not parallel). Outcomes pinned. Verify: tests only; guarded tests pass; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-semantic-guards",
      "title": "Guard heuristic checker tests with SEMANTIC=0"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/test_baseline_diff.py + test_baseline_diff_edge.py + test_baseline_diff_parsers.py ONLY, 249+308+486 per pack, verify at HEAD). Red-test-exempt. Merge overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Shim-removal serializes after this item (applies onto merged shape). Verify: tests only; no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "baseline-diff-merge",
      "title": "Merge baseline-diff test overlap"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 4 files (tests/runner/test_lint_runner_integration.py, tests/conftest.py, tests/runner/test_setup.py, tests/runner/test_setup_install.py); FORBIDDEN test_lint_runner.py (dispatch-split owns incl its :7 disable), test_autofix_conflict_integration.py + test_t9_7_compose_pyright_live.py + 4 self-lint files (prune owns). Red-test-exempt. Remove stale too-many-lines disables (recount lines at HEAD; 479/418 per pack, verify under-500); replace /home/slava paths (conftest.py:86, test_setup.py:252,277, test_setup_install.py:265-350, verify) with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; no new failures vs M1 table; golden hash-equal; grep zero hardcoded checkout in touched files.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "stale-disables-portability-cleanup",
      "title": "Remove stale disables and hardcoded paths"
    },
    {
      "deps": [],
      "description": "Tests-only, owns ONLY 6 files wholly (tests/runner/test_self_lint_clean.py, test_config_consistency.py, test_pyright_noise_filter.py, test_runner_private_imports.py, test_t9_7_compose_pyright_live.py, test_autofix_conflict_integration.py); FORBIDDEN all other test files. Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); hardcoded paths inside owned files handled here (file deleted or path fixed); each removal names survivor (golden/assumption/unit); default full-pipeline pin = tests/runner/test_real_pipeline_smoke.py kept; a named default-collected survivor is allowed only if the report proves smoke itself violates never-test-linting. Keep golden/integration contracts. Verify: tests only; removal→survivor map in report; pytest (minus removed) + integration show no new failures vs M1 table; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "never-test-linting-prune",
      "title": "Prune gate-duplicating tests with survivors"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes, temp copies only. Reproduce: temp .pyi with companion .py (even broken -> skipped) vs orphan .pyi (linted, pyi-underscore fires); count golden 42/43 on .py (verify at HEAD); budget latent cleanup (205 private symbols in 29 stubs + duplicate-code findings, verify). Recommend fix-with-regen (temp-tree/copy or pylint mode + cleanup budget + regen plan for I5) vs document-orphan-only (scope note + stubtest governance). No prod change, no golden change in I4. Feeds I5 plan.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-pyi-scope-spike",
      "title": "Decide pylint-pyi companion-stub scope"
    },
    {
      "deps": [
        "runner-compat-shim-removal"
      ],
      "description": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 150,
      "slug": "runner-dispatch-split",
      "title": "Split dispatch registry below limits"
    },
    {
      "deps": [
        "baseline-diff-merge"
      ],
      "description": "Owns runner/baseline.py/.pyi + runner/parsers.py re-export lines + shim-asserting lines in the merged baseline-diff tests ONLY (applied onto merged shape from baseline-diff-merge); FORBIDDEN dispatch*/__init__ (dispatch-split), types.py/cli-threading (cache-impl), tests/data, baseline edits. Enumerate shim symbols + asserting tests via grep at HEAD (peek_fallback_tools, _FALLBACK_TOOLS, _compare_sorted; incl test_baseline_diff_edge.py:229-236, verify). Delete shims + stale parsers re-exports and update asserting tests; leave __init__ re-export + trivial_wrapper exemptions to dispatch/checkers items. Keep only with in-repo consumer grep evidence + debt note. Verify: grep zero shim symbols (or evidenced with file:line consumers); no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 30,
      "slug": "runner-compat-shim-removal",
      "title": "Remove runner compat shims"
    },
    {
      "deps": [],
      "description": "Owns NEW checkers/_source_stream.py/.pyi + stream read/decode call sites in conformance/stub checkers ONLY; FORBIDDEN _base.py/.pyi (zero diff, semantic-owned), no_try_import register line/patterns (semantic), tests/data, baseline. API (all in _source_stream, @beartype, decode-if-bytes UTF-8 preserving current semantics — item reports exact bytes/str handling verified by tests; tach-clean; <=500 + .pyi): read_module_source(node)->str; is_under_source_root(path, source_roots)->bool (pure; coverage.py migrates its local checker-bound helper to this, passing checker._coverage.patterns.source_roots; _base keeps its existing helper untouched — coexistence documented, future consolidation is backend follow-up); split_trailing_comment(line)->tuple[code, comment|None] adopted by suppression/bare-except trailing paths where mechanical (preceding-comment paths keep local logic unless identical — item reports which). Enumerate sites via grep `\\.stream\\(\\)` at HEAD (report full list; expect suppression/bare-except/stub families, verify) and replace all (grep zero copies outside helper). Verify: grep zero local copies; `git diff -- _base.py _base.pyi` empty; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 100,
      "slug": "checkers-stream-helper",
      "title": "Single-source stream read/decode helper"
    },
    {
      "deps": [
        "checkers-stream-helper",
        "decision-backend-impl",
        "runner-compat-shim-removal"
      ],
      "description": "Owns conformance/*.py (suppression, trivial_wrapper, bare_except, mixins) + stub fidelity rows ONLY; FORBIDDEN _base.py/.pyi incl stale doc (zero diff; backend-impl fixes _base.pyi), no_try_import register line/patterns, tests/data. Depends on decision-backend-impl for the joiner import contract: `from python_setup_lint.checkers._base import normalize_suppressed_codes` (pinned by backend-impl; this item does not implement join logic). Rename _legacy_scan -> _scan_suppressions (suppression_justification_checker.py:61,63 + .pyi:21, verify at HEAD) with all call sites; remove trivial_wrapper dead _legacy_* unconditionally + peek line iff runner confirms deletion (else keep); delete astroid 3.x body[0].value branch (suppression_justification_checker.py:247-271, verify; floor astroid>=4.0.4); register() scope = conformance/*.py only, missing-beartype justification per ADR-012 (no @beartype added); mixin misc via shared typed base attempt with retain-and-report fallback; call joined-code emission via the imported helper (bare-except keeps single symbol). Fix .pyi fidelity rows. On shift: shift report + CHANGELOG snippet (root regenerates). Verify: grep zero _legacy_scan/_legacy_* (except retained peek if runner kept); no new failures vs M1 table; 51 heuristic outcomes pinned or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 40,
      "slug": "checkers-legacy-dead-cleanup",
      "title": "Rename legacy scan and remove dead compat"
    },
    {
      "deps": [],
      "description": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; `lint --refresh-decisions [--path ...]`; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "decision-cache-design-spike",
      "title": "Prototype tracked-cache schema and refresh"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Two-pass pilot for the I5 bake-off (single-author bias NOT fully repaired — downgraded honestly): collect N real repo suppressions + threshold 30+50 + brush-off/meaningful tables, DEDUPED by normalized justification (target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both strata non-empty); rubric (specific technical justification vs placeholder/deferral/brush-off). Rater protocol: pass 1 rates all items; pass 2 re-rates blinded (shuffled order, pass-1 labels hidden); disagreements resolved by a documented adjudication rule (disclose rule + edge-case rubric); report inter-rater agreement between the two passes. Terse borderlines re-rated. Per-source + per-stratum split. Recommend smallest-evaluable corpus + threshold sweep for I5 90/95/85 bars on accepted stratum, or explicit blocker (collection/license/CPU). I5 still requires an independent second rater before any go/no-go. No model choice in I4.",
      "escalate": true,
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "brush-off-corpus-spike",
      "title": "Build two-pass brush-off pilot sample"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "semantic-threshold-consolidation"
      ],
      "description": "Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 150,
      "slug": "decision-backend-impl",
      "title": "Implement veto DecisionBackend with FakeBackend"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "runner-compat-shim-removal",
        "runner-dispatch-split"
      ],
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py/.pyi + refresh threading (runner/cli.py --refresh-decisions branch + help text, runner/types.py RunnerConfig.refresh_decisions: bool = False field, runner/_cli_complexity.py _parse_config_args/_build_runner_config threading; --path scoping reuses existing --path plumbing) + tach.toml (sole owner: add decisions module depends_on=[] + checkers/runner depends_on=[decisions]) ONLY, applied onto final runner shape after dispatch split; FORBIDDEN _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-017 contract as validated by spike (array sorted by (rule, justification, model), indent2 sort_keys; entry + {version, prompt hash, last-seen}; secrets-clean encoding; read-only lint hash-asserted zero writes; explicit refresh lockfile + merge + atomic replace in target dir with DECISIONS_PATH test-only isolation; prune auto missing/stale; --path scoping; jobs==1 required else loud fail; CI-fail). Must pass all tools incl detect-secrets and tach check. Existing gate contracts unchanged. Verify: tmp round-trip; zero-writes hash; refresh merges + prunes + sorts deterministically (double-run byte-identical); CI-fail + isolation + jobs-guard tests; no new failures vs M1 table; golden hash-equal or shift-reported.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 120,
      "slug": "decision-cache-impl",
      "title": "Implement tracked decision cache and refresh"
    },
    {
      "deps": [
        "checkers-semantic-guards",
        "decision-backend-impl",
        "decision-cache-impl",
        "semantic-threshold-consolidation"
      ],
      "description": "Second writer (after M2 handoffs): threshold 2 files (preserve M2 deduped table; rewrite reranker classes only) + suppression-file pipeline block (after guards) + tests/assumptions runtime/decision/cache modules (append-only; deliberate cache-semantics rewrite, not loosened; never touch root __init__ + astroid/beartype/pylint contracts) + semantic-justification.md + custom-checks bullet + troubleshooting section + docs/adr/ADR-014.md + ADR-016.md ONLY; FORBIDDEN AGENTS.md/CHANGELOG.md (snippet in report; docs writes file), tests/data, src. Merge tables pinned (preserved); FakeBackend kwarg + env; cache tmp + hypothesis format incl sort-key determinism; delete vacuous + ImportError-propagation; 4 pair tests (test_semantic_check.py:432,453,473,493, verify): deleted iff the class imports/calls sentence-transformers or _load_reranker/_reset_cache (reranker-coupled), else marked slow; full PYTHON_SETUP_LINT_DECISION_MODEL name in tests/docs. Modules <=500, no suppressions, never test linting; exactly one slow+with_real_api e2e SKELETON required (skipped until model). Docs state veto + cache + no-go; ADRs carry Context/Decision/Consequences + pinned values. Verify: no new failures vs M1 table; golden hash-equal or shift-reported; rumdl clean.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "semantic-tests-rewrite",
      "title": "Rewrite semantic tests and docs (no AGENTS)"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-legacy-dead-cleanup",
        "checkers-semantic-guards",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "never-test-linting-prune",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Sole AGENTS.md + CHANGELOG.md + README.md + config/ty.toml + docs/adr/ADR-013.md + ADR-015.md writer in I4 (after all M2 counts-affecting items + M3 registry/behavior items + M4 backend/cache/tests); FORBIDDEN semantic-justification/custom-checks/troubleshooting/ADR-014/016 (semantic-tests), tach.toml (cache-impl), tests/data, src except ty.toml comment. AGENTS counts from rerun actuals (verify --collect-only + TOOLS==14 + 9-collected contract) + Tool Scope ruff-format row + pipeline subsection (DecisionBackend, no reranker) + testing strategy; CHANGELOG user-visible (extra contents, new/deprecated vars incl full PYTHON_SETUP_LINT_DECISION_MODEL name, cache file, no-go note + version 1.2.10); README v1.2.10 pin; ty.toml remove sentence_transformers; ADRs full Context/Decision/Consequences. Verify: docs-only diff; exact-strings grep per M5 checklist (incl ADR-013..016 Context/Decision/Consequences); rumdl clean; no new failures vs M1 table.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "docs-reconciliation",
      "title": "Reconcile docs counts and versions"
    },
    {
      "deps": [
        "checkers-legacy-dead-cleanup",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "runner-compat-shim-removal",
        "runner-dispatch-split",
        "semantic-tests-rewrite"
      ],
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items: run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (tests/_golden.py:53; never under CI/GITHUB_ACTIONS — guard fails), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on shift reports"
    },
    {
      "deps": [
        "baseline-diff-merge",
        "checkers-factories-split",
        "checkers-semantic-guards",
        "docs-reconciliation",
        "golden-regen-hatch",
        "never-test-linting-prune",
        "runner-factories-trim",
        "semantic-tests-rewrite",
        "semantic-threshold-consolidation",
        "stale-disables-portability-cleanup"
      ],
      "description": "Report-only, zero writes. Record final gate table: format exit 0; lint per-tool on scoped checkout for MemoryError (default: full 14-tool lint on a scoped fresh clone; fallback to detect-secrets via lint --tools on pinned tracked paths src+tests+config+docs+repo-root only if full-tree MemoryError recurs — report cites which + why + paths + filter + version + HEAD); pytest counts; integration 9-collected-0-failed with pre-commit env pinned; golden hash or regen diff; baseline []; docs exact-strings per M5 checklist. Red-cell routing to new root/follow-up items, never baseline edits. Absolute green is required here (M5 only); red cells fail the gate with routing. Feeds close-up.",
      "kind": "fact-finder",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material (dormant path). Tightening intentional when a model ships.",
      "disposition": "confirm with human",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits. Real-model tests are slow + with_real_api, never in default suite.",
      "why": "Matches current venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator secrets answers stand: journals committed; ^\\.factory/ filter merged; harness filter-seeding outside task; acceptance cites mechanism + HEAD.",
      "why": "Steering directive 1794158471467."
    },
    {
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without). AGENTS.md reconciled to this contract.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
    },
    {
      "assumption": "Iteration 4 ships semantic infra only (backend/cache/FakeBackend/docs/corpus pilot); model swap NOT complete at close-up and must not be claimed. I5 triggers: two-pass pilot + independent second rater repairing 215/0, human Fastino decision if GLiDE recommended, CPU latency/RSS benchmark.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating extended by ADR-016; operator must approve infra-only close-up."
    },
    {
      "assumption": "No child epics in iteration 4; all work as 22 root items within the 50-item cap, with file-level single-writer + dep serialization (ADR-013).",
      "why": "I3 epic gate caused 3 empty waves + zero M2 delivery; direct increments avoid bottleneck."
    },
    {
      "assumption": "Model license allowlist: Apache-2.0 / MIT / BSD-2/3-Clause allowed; CC-BY-NC-4.0 and other non-commercial excluded; Fastino Community + unclear/no-license flagged for human review; no model ships without a license verdict.",
      "disposition": "confirm with human",
      "why": "MIT tool cannot absorb non-commercial/unclear model licensing; I5 bake-off needs the gating criterion before any verdict."
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "id": "TD4-B1",
      "resolution": "ADR-009 extended by ADR-016: no model in I4; brush-off-corpus-spike produces a two-pass pilot + rubric + agreement (bias NOT fully repaired); I5 bake-off additionally requires an independent second rater; backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "category": "blocking",
      "description": "I3 M1 gate not closed per engine (map running, kickoff pending) caused 3 empty waves.",
      "id": "TD4-B2",
      "resolution": "ADR-013 abandons epic gate for I4; scope-table-snapshot informational non-gating; closeup-3 verified repo scope carries forward; M2-M5 proceed via file ownership + deps; M2-M4 verify relative to the M1 table, absolute green enforced only at M5."
    },
    {
      "category": "blocking",
      "description": "Cache refresh/root/prune/secrets unresolved (Q4-7); writer-first verdict must be consumed, not invented; blocks M4 backend/cache impls.",
      "id": "TD4-B3",
      "resolution": "ADR-017 pins the refresh contract (+ADR-018 placement); decision-cache-design-spike validates it on tmp with verdict enum (feasible + 4 proofs, or blocked with I5 plan); backend/cache impls consume verdict via deps (no-op attestation on blocked) and rewrite assumption file deliberately."
    },
    {
      "category": "impacting",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, 205 latent private symbols, companion stubs unenforced).",
      "id": "TD4-I1",
      "resolution": "pylint-pyi-scope-spike reproduces + recommends fix-with-regen vs orphan-only with budget; fix + golden regen deferred to I5; I4 golden unchanged on this axis."
    },
    {
      "category": "adjacent",
      "description": "Docs/version drift (AGENTS stale counts/scope/pipeline, CHANGELOG 1.2.9 vs 1.2.10, README v1.2.5 pin, ty.toml sentence_transformers, ADR-013..018 stubs, legacy .gitignore .cache lines retained intentionally).",
      "id": "TD4-A1",
      "resolution": "docs-reconciliation sole AGENTS/CHANGELOG/version/pin/ty.toml/ADR-013/015 writer in I4 (after M2 + M3 + backend/cache/tests); semantic-tests owns non-AGENTS semantic docs + ADR-014/016 and emits CHANGELOG snippet in report; cache-impl owns tach.toml; .gitignore legacy lines kept by design (.cache still ignored; decisions file committed)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules/shims/duplicates/hardcoded paths (dispatch 542, _factories 1393, _factories_extras 511 + dup disables, test_semantic 506, baseline shims, stream blocks, mixin misc, trivial-wrapper disables, /home/slava paths) + _base/_source_stream _is_under_source_root coexistence.",
      "id": "TD4-A2",
      "resolution": "Split across M2-M3 items per evidence with disjoint files + handoff deps; each removal/merge names survivor; default pipeline pin retained; register() per ADR-012, mixin per attempt-with-fallback; _source_stream helper is canonical for checker call sites going forward, _base keeps its existing helper (zero-diff constraint) with future consolidation as backend follow-up."
    }
  ],
  "adrs": [
    {
      "consequences": "No epic close-ups/handoff in I4; M5 regen consumes item shift declarations directly. 13 dep-free wave-1 items avoid empty waves. Parallel same-file is forbidden; sequential same-file is permitted only via explicit deps with pinned handoff order (guards->semantic-tests, threshold-M2->threshold-M4, baseline-merge->shim->dispatch, backend->legacy-joiner). I5 may reintroduce epics or continue root increments.",
      "context": "I3 planned 3 epics behind map-revalidation + kickoff gate; map stalled (retry + 3 empty waves, Blocked none), kickoff pending, M2 zero delivery per closeup-3. Map + kickoff reports live in orchestration records with high QA surface on report-only items, creating a single-item bottleneck. Review further requires file-level proof for parallel items.",
      "decision": "Iteration 4 ships no child epics; all work as root items with file-level single-writer for parallel items plus dep serialization for handoffs (dispatch/baseline/parsers/__init__ chain, checkers stream->legacy, threshold-M2->backend/M4, guards->semantic-tests, baseline-merge->shim, backend-joiner->legacy, factories/threshold/guards/baseline/portability/prune disjoint, AGENTS/CHANGELOG, golden). Scope-table-snapshot is informational, non-gating. M2-M5 proceed without map-revision gate.",
      "id": "ADR-013",
      "title": "Root-serialized delivery replaces epic decomposition for iteration 4"
    },
    {
      "consequences": "Brush-off rejections guaranteed regardless of model; model only tightens acceptance; SEMANTIC=0 deterministic contract preserved; threshold continuity with current 0.5; single joiner implementation shared by extraction and matching; backend/cache tests assert veto (brush-off uncalled, one call per unique pair, hit without load, no retry storm, warnings once).",
      "context": "ADR-010 says heuristic-first hard gate but current code is semantic-first with heuristic fallback (_base.py:150-158 vs _semantic.py:1-12). Open Q1 asks gate meaning, float vs bool, None mapping. Review requires pinned threshold, kwarg placement, None mapping, joiner ownership, Fake values, warning channel, extra shape, full env names.",
      "decision": "Veto: final = heuristic(text) AND (backend.decide(...)>=DECISION_THRESHOLD) when backend available, else heuristic. DECISION_THRESHOLD=0.5, PROMPT_VERSION='prompt-v1'. Backward-compat optional kwarg backend: DecisionBackend|None=None (keyword-only, public in .pyi) on BOTH check_if_meaningful and semantic_check_if_meaningful; existing 5 call sites unchanged. None mapping: loader/backend None -> heuristic stands; semantic_check preserves bool|None for direct callers, check_if_meaningful always returns bool. Joined rule owned solely by decision-backend-impl as normalize_suppressed_codes(raw)->str in _base.py (+.pyi): strip, drop empties, dedupe, ASCII-sort, join ',' (no spaces); echo matches if primary_lower equals any element_lower; bare-except keeps single symbol; legacy-cleanup imports it (dep edge backend->legacy). FakeBackend.decide returns 1.0; Fake model string 'fake-backend rev test prompt-v1' (no bare hex>=20). Warnings via structlog warning event 'decision_model_unavailable' (model + reason fields) once per process via sentinel; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated warns once per process; PYTHON_SETUP_LINT_DECISION_MODEL parses but loader returns None + exactly-one warning in I4. No retry storm. [semantic] extra retained as empty placeholder (no dependencies) with comment; uv.lock regenerated with zero sentence-transformers edge for the extra. Cache key (justification,rule,model); context is model-input only.",
      "id": "ADR-014",
      "title": "Heuristic-first veto semantics for DecisionBackend (pinned values)"
    },
    {
      "consequences": "'Coding rules enforced' not overstated in I4; golden stable on this axis; I5 plan consumes spike verdict with explicit budget.",
      "context": "_PylintPyiLintTool passes .pyi paths but pylint skips companion stubs (even broken) and lints orphan only; golden 42/43 pyi findings on .py; probe finds 205 latent private stub symbols; fixing changes golden + exposes large cleanup, conflicting with preservation unless staged.",
      "decision": "I4 runs pylint-pyi-scope-spike only (reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs document-orphan-only). No prod change, no golden change on this axis in I4. Fix + regen (if recommended) scheduled in I5.",
      "id": "ADR-015",
      "title": "Pylint-pyi scope decided by spike, fix deferred to iteration 5"
    },
    {
      "consequences": "Intent swap clause remains open after I4; infra makes I5 wiring bounded (get_backend + PYTHON_SETUP_LINT_DECISION_MODEL, no pipeline refactor); gates stay offline/fast/deterministic.",
      "context": "ADR-009 deferred model on 215/0 structural no-go + single-adjudicator limits + Fastino review + no CPU bench. At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled. Two-pass pilot + independent-rater + license + CPU bench still open.",
      "decision": "I4 lands model-independent infra only (veto backend + tracked cache + FakeBackend/NoBackend + packaging swap to no-model + tests/docs + corpus pilot). No model wiring, no real-model default test; exactly one slow+with_real_api e2e SKELETON is required and skipped until a model ships. Model bake-off + wiring gated on I4 corpus pilot + independent second rater + human Fastino decision + CPU bench in I5. Close-up must not claim swap complete.",
      "id": "ADR-016",
      "title": "Iteration-4 semantic scope remains infrastructure-only"
    },
    {
      "consequences": "Single refresh contract for spike validation + impl; no setup-subcommand alternative; CI-safe; test isolation mirrors backend guard; jobs>1 fails loudly instead of silent corruption; deterministic serialization provable via pinned sort key. If spike proves infeasible, it reports verdict blocked and impls merge no-op attestations (must not invent alternative).",
      "context": "ADR-010 requires explicit CI-guarded refresh with lockfile + merge + atomic replace, but invocation shape (lint flag vs setup subcommand vs env sidecar), CI direction, DECISIONS_PATH scope, array sort key, verdict consumption, files cardinality/merge, prune auto-vs-flag, --path scoping, and jobs>1 behavior are unspecified (open Q5-7). Pylint runs as subprocess so verdicts are invisible to runner.",
      "decision": "Refresh invocation is `lint --refresh-decisions [--path ...]` (runner CLI flag; setup-subcommand alternative rejected). Refresh FAILS under CI/GITHUB_ACTIONS (exit non-zero, same guard shape as golden UPDATE_ENV). PYTHON_SETUP_LINT_DECISIONS_PATH is test-only, honored ONLY under PYTEST_CURRENT_TEST; production root is config.cwd with traversal guard (resolved cache path must stay within cwd, no parent escape, no absolute outside). Tracked array is sorted by (rule, justification, model) tuple; object keys use sort_keys. files = sorted unique POSIX relpaths, union-merged on refresh; prune is automatic on refresh for missing files + stale model-id entries (no --prune flag in I4). --path scopes the sweep (entries for unscanned files retained). Refresh requires pylint jobs==1 and fails loudly otherwise (no sidecars in I4). Spike verdict enum: {verdict: feasible|blocked; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it}.",
      "id": "ADR-017",
      "title": "Decision-cache refresh contract (lint flag, CI-fail, test-only isolation)"
    },
    {
      "consequences": "tach check verifies the new boundary; no import duplication; runner/checkers never import each other; tach.toml gains exactly one module + two depends_on edges, owned by a single item.",
      "context": "tach.toml declares both checkers and runner with depends_on=[]. The tracked cache needs cross-module use: runner CLI (refresh write path) and checkers _base/_semantic (read path). Either placement direction violates one empty depends_on; lazy imports are still static imports to tach; no item owned tach.toml so 'tach-clean' was unverifiable.",
      "decision": "Place the cache in a new third module python_setup_lint/decisions/ (file _decision_cache.py +.pyi); checkers and runner both declare depends_on=['python_setup_lint.decisions']; decisions itself depends on nothing. decision-cache-impl solely owns tach.toml in I4 (config exception alongside the refresh threading). _decision_backend.py stays in checkers (imported only by _base/_semantic). The design spike validates this placement; semantic-tests-rewrite uses the decisions import path.",
      "id": "ADR-018",
      "title": "Decision-cache placement in a shared decisions module"
    }
  ]
}

## Task Status
iteration: 4
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-plan-3-dotted-path-injection-risk ref=plan-3 disposition=human-awareness: PYTHON_SETUP_LINT_DECISION_BACKEND dotted path has no test-only enforcement (pytest guard/allowlist); if honored in production lint, env control equals code execution. Architect can decide guard now; operator should be aware. Document in ADR-010 with loader test.
  - awareness-plan-3-model-deferral-awareness ref=plan-3 disposition=human-awareness: Intent requires replacing reranker with CPU-friendly decision model (GLiDE-0.4B or smaller) + git cache. ADR-009 defers model to follow-up on corpus repair + Fastino license verdict; iteration-3 delivers DecisionBackend/cache/FakeBackend, no model. Justified by 215/0 eval no-go but operator must approve close-up will not claim swap complete. Record follow-up triggers (double-rated sample, license decision, CPU benchmark).
  - awareness-plan-4-infra-only-closeup-awareness ref=plan-4 disposition=human-awareness: Intent requires replacing the reranker with a CPU-friendly decision model; plan defers all model wiring to I5 on corpus+license+CPU gates, which is sound given the 215/0 no-go but is a scope deviation ADR-009 says the operator must approve at close-up ('must not claim swap complete'). Proceed with infra now; record operator awareness that close-up stays heuristic-first.
  - awareness-plan-4-infra-only-closeup ref=plan-4 disposition=human-awareness: Intent replaces cross-encoder (_semantic.py:1 reranker, sentence-transformers) with CPU decision model + git cache; ADR-016 ships backend/cache/Fake/docs/corpus only, no wiring, close-up must not claim swap, I5 gated on corpus + human Fastino + CPU bench. High-impact cut architect can decide per ADR-009 no-go (215/0, single-author, no bench). Inform operator swap open.
  - awareness-plan-4-material-never-test-boundaries ref=plan-4 disposition=human-awareness: Material = golden SEMANTIC=0 + unit + CLI/exit + baseline/autofix + configs (heuristic material, model never); never-test-linting bans pytest asserting own gates while retaining golden/integration. Both confirm-with-human, I1-approved. Architect decides preserve; golden stays mechanical contract. Informational only.

## Story Kinds Guide
- **dev**: behavior change; tests first
- **no-behavior**: refactoring, file move, dependency update without prod behavior change
- **test-only**: test additions or improvements without prod code change
- **fact-finder**: investigate library, API, or unknown without writing production code
- **poc**: throwaway proof of concept confined to poc/ folder
- **test-assumptions**: exploratory tests demonstrating how lower level works that stay
- **epic**: large multi-milestone initiative decomposed into child iterations

## Story Kinds Criteria
# Story & Spike Kinds Guide for PM

Item classification matrix for planning and PM edits.
(Numeric bounds live in `limits` and the injected `{{limits}}` section; values below are the current defaults for orientation only.)

## Story Kinds
- `dev`:
  - When: New functionality, bug fixes, behavior changes.
  - Contract: Test-first mandatory (`test-first` step alters `paths.tests` only, declares `target` {selectors, expectRed}); `develop` step makes target green; QA verifies red-test and test-diff; peer code review.
  - Bounds: Prod lines within `storyMaxProdLines`.
- `no-behavior`:
  - When: Refactoring, performance optimization, dead code removal, file renames, internal restructuring.
  - Contract: Tests must stay materially identical; QA verifies `test-diff` contains no semantic assertion weakens/shifts; peer code review.
  - Bounds: Prod lines within `storyMaxProdLines`.
- `test-only`:
  - When: Adding test coverage, regression suites, test fixtures, integration tests.
  - Contract: Edits strictly confined to `paths.tests`; production code paths untouched; peer code review.
- `simple`:
  - When: Minor single-file tweak, trivial fix, or single constant update.
  - Contract: Single step `develop` + gates + advisory `size`. No review step. Gates green and under `simpleMaxProdLines` merges; over budget or red gates converts to a `no-behavior` item.
  - Bounds: Prod lines within `simpleMaxProdLines` (advisory sizing reference for conversion).

## Spike Kinds
- `fact-finder`:
  - When: Architecture unknowns, external API discovery, library capabilities, root cause investigations.
  - Contract: Read-only on repository; outputs `items/{item}/findings.md` and structured findings; review checks result validity.
- `poc`:
  - When: Feasibility experiments, prototyping throwaway implementation.
  - Contract: All edits strictly confined to the item's `poc/` folder (`{orchestrationFolder}/{task}/items/{item}/poc/`); production paths untouched; review checks result validity.
- `test-assumptions`:
  - When: Proving third-party library behavior, verifying runtime environment assumptions, confirming contract guarantees.
  - Contract: Permanent tests added to `paths.tests` asserting assumptions; review checks result validity.

## Context & Citations
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
- iteration (integer, required, min: 1)
- amendmentIndex (integer, optional, min: 0)
- items (array of object, required)
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - assignment (string, required)
  - outlineRef (string, optional)
  - milestone (string, required)
  - wave (integer, required, min: 1)
  - deps (array of string, optional)
  - scenarioRefs (array of string, optional)
  - citations (array of string, optional)
  - escalate (boolean, optional)
