# Step: PM Edits

## Goal
Deconstruct the approved architectural plan into scheduled, executable item specifications (`edits` artifact).

## Rules
- Yield only: you have NO file tools. Everything you need is below (`{
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "Validated unified map: owner enum {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15 (±5 drift budget per owner, total equal to the git-ls-files recount); epic assignment maps setup-testing files to epic-runner-modernize; ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/**; root-owned group (tests/data, config, docs, repo-root files, epics read-only except enumerated packaging exception); symbol-exclusion column (incl. _base.py:238 rule-echo line and no_try_import register line as semantic-owned); planned-path reservations (incl. tests/checkers/conftest.py as reservation); drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed}. Artifact = item-report tables with revision map-<HEAD short SHA> (durable orchestration records).",
        ".secrets.baseline filters_used gains the ^\\.factory/ should_exclude_file entry in the version-correct form (schema pre-validated against installed detect-secrets); journals stay committed; M1 acceptance cites mechanism + pinned HEAD, not finding counts.",
        "Pylint writer-first verdict (writer + timing + --path scoping) readable from tests/assumptions/test_pylint_cache_semantics.py report; cache-design-spike input satisfied.",
        "AGENTS.md split by exact rows with engine wave order: runner-owned (if assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff with post-kickoff HEAD); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Agents perform zero git writes.",
        "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the drift list; defaults = runner owns counts/scope/version/pin rows, semantic owns pipeline subsection, root owns ADR reconciliation via adr-formalization. Shared-file single-writer table: checkers/_base.py = semantic only; _source_stream.py = checkers (new file); no_try_import register line + patterns = semantic; test_suppression class block = semantic, rest = checkers; trivial_wrapper peek line preconditioned on runner close-up."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Ownership map validated\n  Given iteration-2 audit reports plus HEAD\n  When ownership-map-revalidation re-globs via git ls-files and recounts\n  Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>",
        "Scenario: Secrets gate green by mechanism\n  Given the schema pre-validation plus the .factory/ exclusion merged\n  When detect-secrets scans git ls-files on a clean checkout\n  Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only",
        "Scenario: Epic kickoff gated on validated artifacts\n  Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion\n  When epic-kickoff-gate completes\n  Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)"
      ],
      "title": "Validated decomposition and green-gate preconditions"
    },
    {
      "directionalInterfaces": [
        "Epic runner (owns runner/** + setup-testing files): dispatch.py split into modules each ≤500 lines with zero too-many-lines/complexity suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced re-exports); baseline.py compat shims deleted (or kept with in-repo consumer evidence + debt note); tests/runner/_factories_extras.py split with duplicate disables collapsed; each test removal/merge names its survivor; shift report or no-shift declaration emitted in the epic close-up.",
        "Epic checkers: shared stream helper in NEW checkers-owned _source_stream.py replacing the drift-list-pinned block list (grep-verified zero remaining copies), ZERO _base.py diff from this epic; register() keeps only the ADR-012 missing-beartype justification with no @beartype added (no_try_import register line skipped — semantic-owned); type-ignore[misc] removal attempted via shared typed base with retain-and-report fallback; _legacy_scan renamed with all call sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek line preconditioned on runner close-up; tests/checkers/_factories.py split by checker group with ParameterSet typing; W9704/W9738 callers emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic tests; 40 W9704 + 11 W9738 heuristic outcomes pinned.",
        "Epic semantic (sole _base.py writer): DecisionBackend Protocol decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with FakeBackend kwarg/env injection tests; dotted-path honored only under PYTEST_CURRENT_TEST with loader test pinning both behaviors; .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); read-only lint proven by hash-asserted zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra without sentence-transformers with loader-returns-None + one-warning proof (no hatch entry, .gitignore untouched); rule-echo on-any-element change at _base.py:238 with joined cache keys; merged deduped heuristic table; docs state backend + cache + no-go."
      ],
      "id": "M2",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Runner modernized without behavior drift\n  Given the runner + setup-testing scope from the validated map\n  When its items merge\n  Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record",
        "Scenario: Checkers modernized without behavior drift\n  Given the checkers epic scope with semantic exclusions\n  When its items merge\n  Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported",
        "Scenario: Semantic infrastructure ready for a future model\n  Given the ADR-009 no-go verdict\n  When the semantic epic merges\n  Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported"
      ],
      "title": "Subsystem modernization via three epics"
    },
    {
      "directionalInterfaces": [
        "Shift-report handoff contract: each epic emits a shift-report section or explicit no-shift declaration in its close-up report with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); epic-shift-report-collection is the first post-replan item and stays pending unless all three close-ups exist (fails open, never fabricates); golden-regen-hatch consumes only the handoff record; review record = regen-hatch report with key-by-key diff (or no-op attestation).",
        "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against the handoff shift report; golden + tool counts committed together; no blind regen ever.",
        "Final gate table: format exit code; lint per-tool results on scoped checkout; pytest counts (pass/skip/deselect); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without); golden hash equality or regen diff; lint.baseline []; docs reconciliation checklist with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)\n  When golden-regen-hatch runs\n  Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs",
        "Scenario: Iteration closes with evidence\n  Given all epic merges via the handoff record\n  When final-gate-validation completes\n  Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit"
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
      "description": "Whether any compliant decision model exists is unknown (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral — no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample, license decision, CPU benchmark).",
      "id": "U2"
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
      "description": "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for the ownership universe via git ls-files filtered to src+scripts+tests minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner with total equal to the recount. Confirm symbol exclusions (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test modules + TestSuppressionRerankerPipeline class block), planned-path reservations (incl. tests/checkers/conftest.py as reservation, not an owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin the exact stream read/decode block list + helper signature for the checkers epic. Output: validated map with revision map-<HEAD short SHA> + drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed} consumed by all three epics. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "ownership-map-revalidation",
      "title": "Re-validate unified ownership map at HEAD"
    },
    {
      "deps": [],
      "description": "Land the operator-approved exclusion so the lint gate is green on clean checkouts. Pre-validate the filters_used schema against the installed detect-secrets version first (should_exclude_file signature; list-pattern vs scalar form) and use the version-correct form; then insert the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. Verify: full git-ls-files detect-secrets scan exits 0 on clean checkout while a planted control secret still exits 1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk caveat (write-time redaction + periodic unfiltered audits). No other baseline edits.",
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
      "description": "Root-owned coordination checkpoint (report-only, zero repo writes). Confirm the three epics consumed the validated map revision + drift list, the pylint verdict is readable, and the .secrets.baseline exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave order (runner item in an earlier wave than the semantic pipeline item when runner is assigned, with the read-only merge-base verification rule), the shared-file single-writer table, and docs-row assignments from the drift list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin; semantic owns pipeline subsection; root owns ADR reconciliation via adr-formalization). Resolve any ownership dispute by amended assignment before epic waves scale. Output: gate report with consumed revision ID, per-epic ownership tables, wave order, docs assignments, and zero unresolved disputes (each resolved dispute cites its amended assignment reference).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "epic-kickoff-gate",
      "title": "Epic kickoff and ownership-dispute gate"
    },
    {
      "deps": [],
      "description": "Root-owned ADR lifecycle (docs only, root-owned files): overwrite the docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences ADRs matching this plan, create docs/adr/ADR-012.md for the register() exemption, add staleness notes to ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify: 12 ADR files each carry Context/Decision/Consequences or an explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment).",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "adr-formalization",
      "title": "Formalize ADRs 009-012 and reconcile stale ADRs"
    },
    {
      "deps": [
        "epic-kickoff-gate"
      ],
      "description": "Root-owned fan-in (report-only, zero repo writes). M2 replanAfter:true is the enforceable gate: the engine schedules this item only in a post-replan wave after M2 epic close-ups exist. Read the three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up is missing, the item stays pending (fails open — never fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff record has exactly 3 epic sections, each either a shift report or an explicit no-shift declaration.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "epic-shift-report-collection",
      "title": "Consolidate epic shift reports into handoff record"
    },
    {
      "deps": [
        "epic-shift-report-collection"
      ],
      "description": "Root-owned regen hatch, executed ONLY on a reviewed shift report in the handoff record (heuristic outcome change, e.g. joined-rule encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), verify byte-identical double run, review the added/removed diff key-by-key against the shift report's justification-class description, commit golden + tool counts together. If all three handoff sections declare no-shift, this item is a no-op verification (golden byte-identical). NEVER blind-regen. Output: regen report with key-by-key diff review (or no-op attestation) consumed by final-gate-validation.",
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
      "description": "Root-owned final validation (report-only, zero repo writes): format gate exit 0; lint gate green on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green (count + skips recorded); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it installed, 7 passed + 2 skipped without); golden byte-identical or regen-with-reviewed-diff per the hatch report; lint.baseline []; docs reconciliation verified with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Record final gate table for close-up. Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files) — fixes go back to items, never to baseline edits.",
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
    },
    {
      "assumption": "Integration gate contract is 9 collected, 0 failed with pre-commit env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands integration row is reconciled to this contract, not unconditional 9/9 or stale 7 pass.",
      "why": "tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional 9/9 fails on minimal envs while stale 7 pass under-reports."
    },
    {
      "assumption": "Iteration 3 ships semantic infrastructure only (DecisionBackend, tracked cache, FakeBackend, docs); the headline model swap is NOT complete at close-up and must not be claimed as such. Follow-up triggers: double-rated real brush-off sample repairing the 215/0 corpus defect, human Fastino license decision if GLiDE is recommended, CPU latency/RSS benchmark on the chosen runtime.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating; operator must approve infra-only close-up per review human-awareness item."
    },
    {
      "assumption": "Epics are first-class plan output for root tasks (same model as iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8 in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12, semantic ≤10 items) are enforced when each epic's own plan is reviewed.",
      "why": "The plan schema defines child-epic spawning for root tasks; epic-internal items live in child plans with their own review, not in the root item list."
    }
  ],
  "epics": [
    {
      "intent": "# epic-runner-modernize\n\nChild epic of `modernize`. Own per validated map: runner/** (src + tests + stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py, setup/install tests). Out of scope: checkers/**, semantic symbols, tests/data/** (read golden for verification only; NEVER write — regen is a root item), tests/checkers/**. Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement: remove all complexity suppressions by refactoring (dispatch.py 542-line disable -> split registry/strategies/parser-sets into modules each <=500 with single-source re-exports; no threshold raises). Delete dead compat (baseline.py peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting tests) unless external-consumer evidence is found in-repo (then record and keep). Remove redundant wrappers/fallbacks per audit rows. Split tests/runner/_factories_extras.py (511 lines; collapse the duplicate disables) by group.\n2. Test debloat per test-debloat-audit rows: merge overlapping baseline-diff/runner-stats/t3 parser-completeness coverage (exact duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting groups owned by runner (self-lint, config-consistency, noise-filter, private-imports scan, hardcoded-checkout live test) mapping each intent to golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename milestone-ID test files by behavior (keep class/function contract names where gates reference them).\n3. Keep test intent: every removal/merge names its survivor (golden scenario, assumption test, or retained unit test); default suite keeps a full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected survivor named).\n4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); the engine schedules this item in an earlier wave than the semantic pipeline item (order in kickoff report); record the merge HEAD for semantic's read-only merge-base verification. If unassigned, propose count/scope diffs in the close-up report for the root docs follow-up; never touch other sections.\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: golden 158 findings + tool counts byte-identical unless a reviewed regen is requested via shift report (root regenerates); lint.baseline stays [].\n\n## Acceptance\n- runner/** + setup-testing files have zero too-many-lines/complexity suppressions; all modules <=500 lines; dispatch registry still single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).\n- Compat shims deleted (or kept with in-repo consumer evidence + debt note).\n- Removed tests each map to a survivor; blocking-debt limbs from the audit either pinned by new tests or explicitly flagged.\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-runner-modernize"
    },
    {
      "intent": "# epic-checkers-modernize\n\nChild epic of `modernize`. Own per validated map: checkers/** (src + tests + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch, zero diff from this epic): checkers/_semantic.py+.pyi, _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo line (this epic makes ZERO _base.py edits — its stream helper lives in new checkers-owned _source_stream.py), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's register() disable line (semantic standardizes it alongside the patterns), tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block. Planned-path reservations for semantic modules are read-only. Out of scope: runner/**, tests/data/** (read-only), other test dirs, AGENTS.md (never touch). Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement on checkers/**: shared stream read/decode helper in NEW _source_stream.py replacing the drift-list-pinned block list (audit-estimated ~15; exact list + helper signature pinned at re-glob; grep-verified zero remaining copies); register() keeps the ADR-012 missing-beartype justification (no @beartype added; skip no_try_import_checker.py's register line — semantic-owned); type-ignore[misc] on mixin classes: attempt removal via a shared typed base, fallback retain with standardized justification + reported blocker (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path) with all call sites updated; trivial_wrapper_checker: remove dead _legacy_* exemptions unconditionally, remove the peek_fallback_tools exemption ONLY after reading the runner close-up confirming shim deletion (if runner kept it, keep the exemption); split or slim over-limit modules (never raise thresholds); fix .pyi fidelity/private-symbol rows from the audit.\n2. Test debloat per test-debloat-audit rows: split tests/checkers/_factories.py (1,393 lines) by checker group with ParameterSet typing and cases next to tests; inline the 10 local _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers; remove unused factory helpers; fix test naming toward test_<method>_given_<condition>_then_<expected> for touched files; remove never-testing-linting checker tests only if the audit lists them (with survivors).\n3. Joined-code extraction at W9704/W9738 call sites (this epic owns the caller files): extract all suppressed codes via existing patterns, normalize/sort/join ',' as the rule argument (bare-except keeps single symbol). The on-any-element matching lives in the semantic-owned body; either merge order converges to the same final state (extraction alone is echo-neutral under exact match; matching alone is a no-op for single codes), so no cross-epic ordering is needed — if outcomes shift, emit a shift report. Never edit check_if_meaningful itself.\n4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0 guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except the semantic-owned pipeline class block, which this epic does not touch).\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled corpora; lint.baseline stays [].\n\n## Acceptance\n- Zero copied stream blocks outside _source_stream.py; zero _base.py diff; register() functions carry only the ADR-012 justification; mixin misc suppressions removed or retained-with-justification per the attempt rule; no over-limit checker module with a disable.\n- _factories.py split with no behavior change; local helper duplicates eliminated; callers emit joined codes.\n- All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or with reviewed shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-checkers-modernize"
    },
    {
      "intent": "# epic-semantic-infrastructure\n\nChild epic of `modernize`. Implement the model-INDEPENDENT semantic infrastructure now; model wiring waits on the corpus-repair + license verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files: checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype, structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate + backend injection + rule-echo on-any-element matching for joined codes: _base.py:238 exact-match becomes any-element match over comma-joined sorted codes; backward-compatible no-op for single codes); _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in no_try_import_checker.py; pyproject [semantic] extra block + uv.lock regeneration (enumerated packaging exception, single writer; .gitignore untouched — legacy .cache lines stay, decisions file committed; NO hatch entry — tracked cache is consumer-runtime data, not wheel payload); docs (semantic-justification.md rewrite, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG user-visible); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block, new runtime-assumption modules under tests/assumptions/ (append-only; never touch root __init__ + 3 contract modules + test_pylint_cache_semantics.py). tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).\n\nProtocol with root: NEVER write tests/data/** (read golden for verification only); on heuristic shift emit shift report + CHANGELOG behavior description (root regenerates). AGENTS.md: ### Semantic justification pipeline subsection ONLY; verify read-only via git merge-base that its base contains the runner AGENTS.md merge when runner was assigned (else wait for the earlier engine wave); never touch Quick Commands/Tool Scope rows. No edits to tests/integration.py, tests/conftest.py. Runner touch: none. Emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n\n## Requirements\n1. Contracts (ADR-010): keep check_if_meaningful signature + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate (rejections never reach backend). semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins both). No patching globals/imports, no private imports.\n2. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model), secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh only (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to linted files; drop empty-files + stale-model. Concurrency per pylint writer-first verdict (read the merged verdict; if pylint-cache-assumptions unmerged, root item lands first — do not invent semantics). Must pass all tools incl. detect-secrets.\n3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but with no compliant model available the loader returns None (one warning, sentinel, heuristic stands). sentence-transformers dropped from [semantic] (proven: extra contains no sentence-transformers; uv.lock has no such edge for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Joined-rule cache keys + on-any-element matching owned here (extraction at call sites owned by checkers epic; either order converges). On shift: shift report + CHANGELOG, root regenerates.\n4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold tables into one deduped parametrized table (heuristic outcomes pinned); FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; delete vacuous `is None or ...` + ImportError-propagation test; mark the 4 pair tests slow (or delete with the reranker); modules <=500, no suppressions; never test linting. (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model ships) is allowed, not required.\n5. Docs: rewrite semantic-justification.md (heuristic-gated backend + tracked cache + no-go status), custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches backend; one call per unique pair; scoped cleanup; no retry storm.\n- Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled comments (or shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned, empty baseline.",
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
      "resolution": "secrets-baseline-exclusion lands the approved ^\\.factory/ filter in version-correct form after schema pre-validation (journals stay committed); final validation runs on scoped/clean checkout and cites mechanism + HEAD."
    },
    {
      "category": "adjacent",
      "description": "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8 problem-statement ADRs partly stale; design/ vs docs/adr location split.",
      "id": "TD3-A1",
      "resolution": "Decision rule applied at epic-kickoff-gate from the drift list; defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin, semantic owns pipeline subsection, root owns ADR reconciliation via the adr-formalization item (overwrite 009/010/011 stubs with full ADRs, create ADR-012.md, staleness notes on 001/005/006, docs/adr location cross-reference). Kickoff records assignments; unassigned rows stay with root."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules with disables, dead compat shims, duplicated test helpers, milestone-ID test names, hardcoded checkout paths — split by owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py (511, incl. duplicate-disable collapse); checkers owns tests/checkers/_factories.py (1393); semantic owns tests/checkers/test_semantic_check.py (506).",
      "id": "TD3-A2",
      "resolution": "Each epic resolves its owned rows per audit (register() disables exempt per ADR-012; mixin misc per attempt-with-fallback rule); each removal names a survivor; blocking-debt limbs pinned or explicitly flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "No model ships in iteration 3; intent's swap clause is deferred until a compliant model is proven. Epics build backend/cache infrastructure against FakeBackend + tracked cache; model wiring is a bounded follow-up once the verdict lands. Close-up must not claim the swap complete.",
      "context": "Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.",
      "decision": "Defer model implementation to a follow-up contingent on (a) double-rated real brush-off sample resolving the corpus-construction defect and (b) human Fastino license decision if GLiDE is recommended. Iteration 3 delivers everything model-independent: heuristic-first DecisionBackend + tracked cache infrastructure, runner/checkers debloat, docs reconciliation.",
      "id": "ADR-009",
      "title": "No-go-gated semantic implementation with infrastructure-first delivery"
    },
    {
      "consequences": "Backend/cache work proceeds against pinned contracts without waiting for the model verdict; a compliant model plugs in via get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path surface is test-only by construction, verified by a loader test.",
      "context": "Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending. The test-only dotted-path backend import would be an arbitrary-code-execution surface if honored in production lint.",
      "decision": "Adopt iteration-2 spike contracts as authoritative unless contradicted at HEAD: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1] with heuristic-first hard gate; tracked JSON array .python-setup-decisions.json at linted root (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint read-only with hash-asserted zero writes; explicit CI-guarded refresh (lockfile + merge + atomic); prune empty-files + stale-model; writer-first concurrency verdict from pylint-cache-assumptions (merge pending item first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint ignores it. A loader test pins both behaviors (honored under pytest; ignored with the marker removed).",
      "id": "ADR-010",
      "title": "Adopt iteration-2 semantic spike contracts as build baseline"
    },
    {
      "consequences": "Subsystem epics start with dispute-free ownership; no concurrent shared-file edits (single-writer table); AGENTS.md conflicts avoided by heading split + engine wave order; M3 close-out consumes a single handoff record gated by the M2 replan.",
      "context": "M4 audits merged with the unified 5-owner map but report completeness validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split, shared-file edits, packaging exceptions, and the epic-to-root shift-report handoff need machine-checkable definitions because no cross-epic dependency edges exist and agents must never run git writes.",
      "decision": "Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic epics in one wave. Epic assignment maps setup-testing files to epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py + setup/install tests). AGENTS.md split by exact rows with engine-enforced wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Shared-file single-writer table (no concurrent edits): checkers/_base.py = semantic only (checkers puts its stream helper in new checkers-owned _source_stream.py, zero _base.py diff); no_try_import_checker.py register() disable line + _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line); test_suppression file = checkers owns all lines except the TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper exemption list = checkers, with the peek_fallback_tools line preconditioned on reading the runner close-up (deleted iff runner confirms shim deletion). Packaging exception: semantic solely owns the pyproject [semantic] extra block + uv.lock regeneration (single writer, enumerated exception to root-owned repo-root files); .gitignore untouched (legacy .cache lines stay; decisions file committed); no hatch entry (tracked cache is consumer-runtime data, not wheel payload). Shift-report handoff: each epic emits a shift-report section or explicit no-shift declaration in its close-up report; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); root epic-shift-report-collection is the first post-replan item, stays pending unless all three close-ups exist, and consolidates the handoff record that golden-regen-hatch consumes.",
      "id": "ADR-011",
      "title": "Validated-map epic decomposition with defined AGENTS split and shift handoff"
    },
    {
      "consequences": "register() disables remain as documented exemptions counted as exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal is attempt-with-fallback: either clean removal or a standardized retained justification, both verifiable.",
      "context": "Every checker register(linter: PyLinter) omits @beartype with a missing-beartype disable citing PyLinter runtime-unavailability / circular import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import; dropping the disable retriggers the custom missing-beartype checker. Separately, 4 mixin checkers suppress a SourceRootMixin.options vs BaseChecker.options conflict (e.g. beartype_checker.py:21) whose removability via a shared typed base is unproven and may be blocked by pylint typing.",
      "decision": "Retain the missing-beartype disable on all register() functions with a standardized justification (PyLinter is a pylint internal type unavailable at runtime for beartype; circular import). Annotation stays PyLinter under TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on mixin classes is attempted via a shared typed base; if pylint typing blocks removal, retain with the standardized justification and report the blocker — both outcomes satisfy the epic.",
      "id": "ADR-012",
      "title": "register() missing-beartype exemption for PyLinter circular import"
    }
  ]
}`, `iteration: 3
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
  - awareness-plan-3-model-deferral-awareness ref=plan-3 disposition=human-awareness: Intent requires replacing reranker with CPU-friendly decision model (GLiDE-0.4B or smaller) + git cache. ADR-009 defers model to follow-up on corpus repair + Fastino license verdict; iteration-3 delivers DecisionBackend/cache/FakeBackend, no model. Justified by 215/0 eval no-go but operator must approve close-up will not claim swap complete. Record follow-up triggers (double-rated sample, license decision, CPU benchmark).`, kinds guides, `{
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
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "Validated unified map: owner enum {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15 (±5 drift budget per owner, total equal to the git-ls-files recount); epic assignment maps setup-testing files to epic-runner-modernize; ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/**; root-owned group (tests/data, config, docs, repo-root files, epics read-only except enumerated packaging exception); symbol-exclusion column (incl. _base.py:238 rule-echo line and no_try_import register line as semantic-owned); planned-path reservations (incl. tests/checkers/conftest.py as reservation); drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed}. Artifact = item-report tables with revision map-<HEAD short SHA> (durable orchestration records).",
        ".secrets.baseline filters_used gains the ^\\.factory/ should_exclude_file entry in the version-correct form (schema pre-validated against installed detect-secrets); journals stay committed; M1 acceptance cites mechanism + pinned HEAD, not finding counts.",
        "Pylint writer-first verdict (writer + timing + --path scoping) readable from tests/assumptions/test_pylint_cache_semantics.py report; cache-design-spike input satisfied.",
        "AGENTS.md split by exact rows with engine wave order: runner-owned (if assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff with post-kickoff HEAD); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Agents perform zero git writes.",
        "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the drift list; defaults = runner owns counts/scope/version/pin rows, semantic owns pipeline subsection, root owns ADR reconciliation via adr-formalization. Shared-file single-writer table: checkers/_base.py = semantic only; _source_stream.py = checkers (new file); no_try_import register line + patterns = semantic; test_suppression class block = semantic, rest = checkers; trivial_wrapper peek line preconditioned on runner close-up."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Ownership map validated\n  Given iteration-2 audit reports plus HEAD\n  When ownership-map-revalidation re-globs via git ls-files and recounts\n  Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>",
        "Scenario: Secrets gate green by mechanism\n  Given the schema pre-validation plus the .factory/ exclusion merged\n  When detect-secrets scans git ls-files on a clean checkout\n  Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only",
        "Scenario: Epic kickoff gated on validated artifacts\n  Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion\n  When epic-kickoff-gate completes\n  Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)"
      ],
      "title": "Validated decomposition and green-gate preconditions"
    },
    {
      "directionalInterfaces": [
        "Epic runner (owns runner/** + setup-testing files): dispatch.py split into modules each ≤500 lines with zero too-many-lines/complexity suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced re-exports); baseline.py compat shims deleted (or kept with in-repo consumer evidence + debt note); tests/runner/_factories_extras.py split with duplicate disables collapsed; each test removal/merge names its survivor; shift report or no-shift declaration emitted in the epic close-up.",
        "Epic checkers: shared stream helper in NEW checkers-owned _source_stream.py replacing the drift-list-pinned block list (grep-verified zero remaining copies), ZERO _base.py diff from this epic; register() keeps only the ADR-012 missing-beartype justification with no @beartype added (no_try_import register line skipped — semantic-owned); type-ignore[misc] removal attempted via shared typed base with retain-and-report fallback; _legacy_scan renamed with all call sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek line preconditioned on runner close-up; tests/checkers/_factories.py split by checker group with ParameterSet typing; W9704/W9738 callers emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic tests; 40 W9704 + 11 W9738 heuristic outcomes pinned.",
        "Epic semantic (sole _base.py writer): DecisionBackend Protocol decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with FakeBackend kwarg/env injection tests; dotted-path honored only under PYTEST_CURRENT_TEST with loader test pinning both behaviors; .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); read-only lint proven by hash-asserted zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra without sentence-transformers with loader-returns-None + one-warning proof (no hatch entry, .gitignore untouched); rule-echo on-any-element change at _base.py:238 with joined cache keys; merged deduped heuristic table; docs state backend + cache + no-go."
      ],
      "id": "M2",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Runner modernized without behavior drift\n  Given the runner + setup-testing scope from the validated map\n  When its items merge\n  Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record",
        "Scenario: Checkers modernized without behavior drift\n  Given the checkers epic scope with semantic exclusions\n  When its items merge\n  Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported",
        "Scenario: Semantic infrastructure ready for a future model\n  Given the ADR-009 no-go verdict\n  When the semantic epic merges\n  Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported"
      ],
      "title": "Subsystem modernization via three epics"
    },
    {
      "directionalInterfaces": [
        "Shift-report handoff contract: each epic emits a shift-report section or explicit no-shift declaration in its close-up report with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); epic-shift-report-collection is the first post-replan item and stays pending unless all three close-ups exist (fails open, never fabricates); golden-regen-hatch consumes only the handoff record; review record = regen-hatch report with key-by-key diff (or no-op attestation).",
        "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against the handoff shift report; golden + tool counts committed together; no blind regen ever.",
        "Final gate table: format exit code; lint per-tool results on scoped checkout; pytest counts (pass/skip/deselect); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without); golden hash equality or regen diff; lint.baseline []; docs reconciliation checklist with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)\n  When golden-regen-hatch runs\n  Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs",
        "Scenario: Iteration closes with evidence\n  Given all epic merges via the handoff record\n  When final-gate-validation completes\n  Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit"
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
      "description": "Whether any compliant decision model exists is unknown (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral — no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample, license decision, CPU benchmark).",
      "id": "U2"
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
      "description": "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for the ownership universe via git ls-files filtered to src+scripts+tests minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner with total equal to the recount. Confirm symbol exclusions (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test modules + TestSuppressionRerankerPipeline class block), planned-path reservations (incl. tests/checkers/conftest.py as reservation, not an owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin the exact stream read/decode block list + helper signature for the checkers epic. Output: validated map with revision map-<HEAD short SHA> + drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed} consumed by all three epics. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "ownership-map-revalidation",
      "title": "Re-validate unified ownership map at HEAD"
    },
    {
      "deps": [],
      "description": "Land the operator-approved exclusion so the lint gate is green on clean checkouts. Pre-validate the filters_used schema against the installed detect-secrets version first (should_exclude_file signature; list-pattern vs scalar form) and use the version-correct form; then insert the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. Verify: full git-ls-files detect-secrets scan exits 0 on clean checkout while a planted control secret still exits 1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk caveat (write-time redaction + periodic unfiltered audits). No other baseline edits.",
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
      "description": "Root-owned coordination checkpoint (report-only, zero repo writes). Confirm the three epics consumed the validated map revision + drift list, the pylint verdict is readable, and the .secrets.baseline exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave order (runner item in an earlier wave than the semantic pipeline item when runner is assigned, with the read-only merge-base verification rule), the shared-file single-writer table, and docs-row assignments from the drift list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin; semantic owns pipeline subsection; root owns ADR reconciliation via adr-formalization). Resolve any ownership dispute by amended assignment before epic waves scale. Output: gate report with consumed revision ID, per-epic ownership tables, wave order, docs assignments, and zero unresolved disputes (each resolved dispute cites its amended assignment reference).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "epic-kickoff-gate",
      "title": "Epic kickoff and ownership-dispute gate"
    },
    {
      "deps": [],
      "description": "Root-owned ADR lifecycle (docs only, root-owned files): overwrite the docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences ADRs matching this plan, create docs/adr/ADR-012.md for the register() exemption, add staleness notes to ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify: 12 ADR files each carry Context/Decision/Consequences or an explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment).",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "adr-formalization",
      "title": "Formalize ADRs 009-012 and reconcile stale ADRs"
    },
    {
      "deps": [
        "epic-kickoff-gate"
      ],
      "description": "Root-owned fan-in (report-only, zero repo writes). M2 replanAfter:true is the enforceable gate: the engine schedules this item only in a post-replan wave after M2 epic close-ups exist. Read the three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up is missing, the item stays pending (fails open — never fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff record has exactly 3 epic sections, each either a shift report or an explicit no-shift declaration.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "epic-shift-report-collection",
      "title": "Consolidate epic shift reports into handoff record"
    },
    {
      "deps": [
        "epic-shift-report-collection"
      ],
      "description": "Root-owned regen hatch, executed ONLY on a reviewed shift report in the handoff record (heuristic outcome change, e.g. joined-rule encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), verify byte-identical double run, review the added/removed diff key-by-key against the shift report's justification-class description, commit golden + tool counts together. If all three handoff sections declare no-shift, this item is a no-op verification (golden byte-identical). NEVER blind-regen. Output: regen report with key-by-key diff review (or no-op attestation) consumed by final-gate-validation.",
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
      "description": "Root-owned final validation (report-only, zero repo writes): format gate exit 0; lint gate green on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green (count + skips recorded); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it installed, 7 passed + 2 skipped without); golden byte-identical or regen-with-reviewed-diff per the hatch report; lint.baseline []; docs reconciliation verified with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Record final gate table for close-up. Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files) — fixes go back to items, never to baseline edits.",
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
    },
    {
      "assumption": "Integration gate contract is 9 collected, 0 failed with pre-commit env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands integration row is reconciled to this contract, not unconditional 9/9 or stale 7 pass.",
      "why": "tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional 9/9 fails on minimal envs while stale 7 pass under-reports."
    },
    {
      "assumption": "Iteration 3 ships semantic infrastructure only (DecisionBackend, tracked cache, FakeBackend, docs); the headline model swap is NOT complete at close-up and must not be claimed as such. Follow-up triggers: double-rated real brush-off sample repairing the 215/0 corpus defect, human Fastino license decision if GLiDE is recommended, CPU latency/RSS benchmark on the chosen runtime.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating; operator must approve infra-only close-up per review human-awareness item."
    },
    {
      "assumption": "Epics are first-class plan output for root tasks (same model as iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8 in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12, semantic ≤10 items) are enforced when each epic's own plan is reviewed.",
      "why": "The plan schema defines child-epic spawning for root tasks; epic-internal items live in child plans with their own review, not in the root item list."
    }
  ],
  "epics": [
    {
      "intent": "# epic-runner-modernize\n\nChild epic of `modernize`. Own per validated map: runner/** (src + tests + stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py, setup/install tests). Out of scope: checkers/**, semantic symbols, tests/data/** (read golden for verification only; NEVER write — regen is a root item), tests/checkers/**. Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement: remove all complexity suppressions by refactoring (dispatch.py 542-line disable -> split registry/strategies/parser-sets into modules each <=500 with single-source re-exports; no threshold raises). Delete dead compat (baseline.py peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting tests) unless external-consumer evidence is found in-repo (then record and keep). Remove redundant wrappers/fallbacks per audit rows. Split tests/runner/_factories_extras.py (511 lines; collapse the duplicate disables) by group.\n2. Test debloat per test-debloat-audit rows: merge overlapping baseline-diff/runner-stats/t3 parser-completeness coverage (exact duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting groups owned by runner (self-lint, config-consistency, noise-filter, private-imports scan, hardcoded-checkout live test) mapping each intent to golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename milestone-ID test files by behavior (keep class/function contract names where gates reference them).\n3. Keep test intent: every removal/merge names its survivor (golden scenario, assumption test, or retained unit test); default suite keeps a full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected survivor named).\n4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); the engine schedules this item in an earlier wave than the semantic pipeline item (order in kickoff report); record the merge HEAD for semantic's read-only merge-base verification. If unassigned, propose count/scope diffs in the close-up report for the root docs follow-up; never touch other sections.\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: golden 158 findings + tool counts byte-identical unless a reviewed regen is requested via shift report (root regenerates); lint.baseline stays [].\n\n## Acceptance\n- runner/** + setup-testing files have zero too-many-lines/complexity suppressions; all modules <=500 lines; dispatch registry still single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).\n- Compat shims deleted (or kept with in-repo consumer evidence + debt note).\n- Removed tests each map to a survivor; blocking-debt limbs from the audit either pinned by new tests or explicitly flagged.\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-runner-modernize"
    },
    {
      "intent": "# epic-checkers-modernize\n\nChild epic of `modernize`. Own per validated map: checkers/** (src + tests + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch, zero diff from this epic): checkers/_semantic.py+.pyi, _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo line (this epic makes ZERO _base.py edits — its stream helper lives in new checkers-owned _source_stream.py), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's register() disable line (semantic standardizes it alongside the patterns), tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block. Planned-path reservations for semantic modules are read-only. Out of scope: runner/**, tests/data/** (read-only), other test dirs, AGENTS.md (never touch). Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement on checkers/**: shared stream read/decode helper in NEW _source_stream.py replacing the drift-list-pinned block list (audit-estimated ~15; exact list + helper signature pinned at re-glob; grep-verified zero remaining copies); register() keeps the ADR-012 missing-beartype justification (no @beartype added; skip no_try_import_checker.py's register line — semantic-owned); type-ignore[misc] on mixin classes: attempt removal via a shared typed base, fallback retain with standardized justification + reported blocker (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path) with all call sites updated; trivial_wrapper_checker: remove dead _legacy_* exemptions unconditionally, remove the peek_fallback_tools exemption ONLY after reading the runner close-up confirming shim deletion (if runner kept it, keep the exemption); split or slim over-limit modules (never raise thresholds); fix .pyi fidelity/private-symbol rows from the audit.\n2. Test debloat per test-debloat-audit rows: split tests/checkers/_factories.py (1,393 lines) by checker group with ParameterSet typing and cases next to tests; inline the 10 local _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers; remove unused factory helpers; fix test naming toward test_<method>_given_<condition>_then_<expected> for touched files; remove never-testing-linting checker tests only if the audit lists them (with survivors).\n3. Joined-code extraction at W9704/W9738 call sites (this epic owns the caller files): extract all suppressed codes via existing patterns, normalize/sort/join ',' as the rule argument (bare-except keeps single symbol). The on-any-element matching lives in the semantic-owned body; either merge order converges to the same final state (extraction alone is echo-neutral under exact match; matching alone is a no-op for single codes), so no cross-epic ordering is needed — if outcomes shift, emit a shift report. Never edit check_if_meaningful itself.\n4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0 guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except the semantic-owned pipeline class block, which this epic does not touch).\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled corpora; lint.baseline stays [].\n\n## Acceptance\n- Zero copied stream blocks outside _source_stream.py; zero _base.py diff; register() functions carry only the ADR-012 justification; mixin misc suppressions removed or retained-with-justification per the attempt rule; no over-limit checker module with a disable.\n- _factories.py split with no behavior change; local helper duplicates eliminated; callers emit joined codes.\n- All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or with reviewed shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-checkers-modernize"
    },
    {
      "intent": "# epic-semantic-infrastructure\n\nChild epic of `modernize`. Implement the model-INDEPENDENT semantic infrastructure now; model wiring waits on the corpus-repair + license verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files: checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype, structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate + backend injection + rule-echo on-any-element matching for joined codes: _base.py:238 exact-match becomes any-element match over comma-joined sorted codes; backward-compatible no-op for single codes); _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in no_try_import_checker.py; pyproject [semantic] extra block + uv.lock regeneration (enumerated packaging exception, single writer; .gitignore untouched — legacy .cache lines stay, decisions file committed; NO hatch entry — tracked cache is consumer-runtime data, not wheel payload); docs (semantic-justification.md rewrite, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG user-visible); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block, new runtime-assumption modules under tests/assumptions/ (append-only; never touch root __init__ + 3 contract modules + test_pylint_cache_semantics.py). tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).\n\nProtocol with root: NEVER write tests/data/** (read golden for verification only); on heuristic shift emit shift report + CHANGELOG behavior description (root regenerates). AGENTS.md: ### Semantic justification pipeline subsection ONLY; verify read-only via git merge-base that its base contains the runner AGENTS.md merge when runner was assigned (else wait for the earlier engine wave); never touch Quick Commands/Tool Scope rows. No edits to tests/integration.py, tests/conftest.py. Runner touch: none. Emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n\n## Requirements\n1. Contracts (ADR-010): keep check_if_meaningful signature + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate (rejections never reach backend). semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins both). No patching globals/imports, no private imports.\n2. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model), secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh only (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to linted files; drop empty-files + stale-model. Concurrency per pylint writer-first verdict (read the merged verdict; if pylint-cache-assumptions unmerged, root item lands first — do not invent semantics). Must pass all tools incl. detect-secrets.\n3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but with no compliant model available the loader returns None (one warning, sentinel, heuristic stands). sentence-transformers dropped from [semantic] (proven: extra contains no sentence-transformers; uv.lock has no such edge for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Joined-rule cache keys + on-any-element matching owned here (extraction at call sites owned by checkers epic; either order converges). On shift: shift report + CHANGELOG, root regenerates.\n4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold tables into one deduped parametrized table (heuristic outcomes pinned); FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; delete vacuous `is None or ...` + ImportError-propagation test; mark the 4 pair tests slow (or delete with the reranker); modules <=500, no suppressions; never test linting. (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model ships) is allowed, not required.\n5. Docs: rewrite semantic-justification.md (heuristic-gated backend + tracked cache + no-go status), custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches backend; one call per unique pair; scoped cleanup; no retry storm.\n- Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled comments (or shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned, empty baseline.",
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
      "resolution": "secrets-baseline-exclusion lands the approved ^\\.factory/ filter in version-correct form after schema pre-validation (journals stay committed); final validation runs on scoped/clean checkout and cites mechanism + HEAD."
    },
    {
      "category": "adjacent",
      "description": "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8 problem-statement ADRs partly stale; design/ vs docs/adr location split.",
      "id": "TD3-A1",
      "resolution": "Decision rule applied at epic-kickoff-gate from the drift list; defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin, semantic owns pipeline subsection, root owns ADR reconciliation via the adr-formalization item (overwrite 009/010/011 stubs with full ADRs, create ADR-012.md, staleness notes on 001/005/006, docs/adr location cross-reference). Kickoff records assignments; unassigned rows stay with root."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules with disables, dead compat shims, duplicated test helpers, milestone-ID test names, hardcoded checkout paths — split by owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py (511, incl. duplicate-disable collapse); checkers owns tests/checkers/_factories.py (1393); semantic owns tests/checkers/test_semantic_check.py (506).",
      "id": "TD3-A2",
      "resolution": "Each epic resolves its owned rows per audit (register() disables exempt per ADR-012; mixin misc per attempt-with-fallback rule); each removal names a survivor; blocking-debt limbs pinned or explicitly flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "No model ships in iteration 3; intent's swap clause is deferred until a compliant model is proven. Epics build backend/cache infrastructure against FakeBackend + tracked cache; model wiring is a bounded follow-up once the verdict lands. Close-up must not claim the swap complete.",
      "context": "Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.",
      "decision": "Defer model implementation to a follow-up contingent on (a) double-rated real brush-off sample resolving the corpus-construction defect and (b) human Fastino license decision if GLiDE is recommended. Iteration 3 delivers everything model-independent: heuristic-first DecisionBackend + tracked cache infrastructure, runner/checkers debloat, docs reconciliation.",
      "id": "ADR-009",
      "title": "No-go-gated semantic implementation with infrastructure-first delivery"
    },
    {
      "consequences": "Backend/cache work proceeds against pinned contracts without waiting for the model verdict; a compliant model plugs in via get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path surface is test-only by construction, verified by a loader test.",
      "context": "Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending. The test-only dotted-path backend import would be an arbitrary-code-execution surface if honored in production lint.",
      "decision": "Adopt iteration-2 spike contracts as authoritative unless contradicted at HEAD: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1] with heuristic-first hard gate; tracked JSON array .python-setup-decisions.json at linted root (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint read-only with hash-asserted zero writes; explicit CI-guarded refresh (lockfile + merge + atomic); prune empty-files + stale-model; writer-first concurrency verdict from pylint-cache-assumptions (merge pending item first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint ignores it. A loader test pins both behaviors (honored under pytest; ignored with the marker removed).",
      "id": "ADR-010",
      "title": "Adopt iteration-2 semantic spike contracts as build baseline"
    },
    {
      "consequences": "Subsystem epics start with dispute-free ownership; no concurrent shared-file edits (single-writer table); AGENTS.md conflicts avoided by heading split + engine wave order; M3 close-out consumes a single handoff record gated by the M2 replan.",
      "context": "M4 audits merged with the unified 5-owner map but report completeness validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split, shared-file edits, packaging exceptions, and the epic-to-root shift-report handoff need machine-checkable definitions because no cross-epic dependency edges exist and agents must never run git writes.",
      "decision": "Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic epics in one wave. Epic assignment maps setup-testing files to epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py + setup/install tests). AGENTS.md split by exact rows with engine-enforced wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Shared-file single-writer table (no concurrent edits): checkers/_base.py = semantic only (checkers puts its stream helper in new checkers-owned _source_stream.py, zero _base.py diff); no_try_import_checker.py register() disable line + _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line); test_suppression file = checkers owns all lines except the TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper exemption list = checkers, with the peek_fallback_tools line preconditioned on reading the runner close-up (deleted iff runner confirms shim deletion). Packaging exception: semantic solely owns the pyproject [semantic] extra block + uv.lock regeneration (single writer, enumerated exception to root-owned repo-root files); .gitignore untouched (legacy .cache lines stay; decisions file committed); no hatch entry (tracked cache is consumer-runtime data, not wheel payload). Shift-report handoff: each epic emits a shift-report section or explicit no-shift declaration in its close-up report; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); root epic-shift-report-collection is the first post-replan item, stays pending unless all three close-ups exist, and consolidates the handoff record that golden-regen-hatch consumes.",
      "id": "ADR-011",
      "title": "Validated-map epic decomposition with defined AGENTS split and shift handoff"
    },
    {
      "consequences": "register() disables remain as documented exemptions counted as exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal is attempt-with-fallback: either clean removal or a standardized retained justification, both verifiable.",
      "context": "Every checker register(linter: PyLinter) omits @beartype with a missing-beartype disable citing PyLinter runtime-unavailability / circular import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import; dropping the disable retriggers the custom missing-beartype checker. Separately, 4 mixin checkers suppress a SourceRootMixin.options vs BaseChecker.options conflict (e.g. beartype_checker.py:21) whose removability via a shared typed base is unproven and may be blocked by pylint typing.",
      "decision": "Retain the missing-beartype disable on all register() functions with a standardized justification (PyLinter is a pylint internal type unavailable at runtime for beartype; circular import). Annotation stays PyLinter under TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on mixin classes is attempted via a shared typed base; if pylint typing blocks removal, retain with the standardized justification and report the blocker — both outcomes satisfy the epic.",
      "id": "ADR-012",
      "title": "register() missing-beartype exemption for PyLinter circular import"
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
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "Validated unified map: owner enum {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15 (±5 drift budget per owner, total equal to the git-ls-files recount); epic assignment maps setup-testing files to epic-runner-modernize; ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/**; root-owned group (tests/data, config, docs, repo-root files, epics read-only except enumerated packaging exception); symbol-exclusion column (incl. _base.py:238 rule-echo line and no_try_import register line as semantic-owned); planned-path reservations (incl. tests/checkers/conftest.py as reservation); drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed}. Artifact = item-report tables with revision map-<HEAD short SHA> (durable orchestration records).",
        ".secrets.baseline filters_used gains the ^\\.factory/ should_exclude_file entry in the version-correct form (schema pre-validated against installed detect-secrets); journals stay committed; M1 acceptance cites mechanism + pinned HEAD, not finding counts.",
        "Pylint writer-first verdict (writer + timing + --path scoping) readable from tests/assumptions/test_pylint_cache_semantics.py report; cache-design-spike input satisfied.",
        "AGENTS.md split by exact rows with engine wave order: runner-owned (if assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff with post-kickoff HEAD); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Agents perform zero git writes.",
        "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the drift list; defaults = runner owns counts/scope/version/pin rows, semantic owns pipeline subsection, root owns ADR reconciliation via adr-formalization. Shared-file single-writer table: checkers/_base.py = semantic only; _source_stream.py = checkers (new file); no_try_import register line + patterns = semantic; test_suppression class block = semantic, rest = checkers; trivial_wrapper peek line preconditioned on runner close-up."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Ownership map validated\n  Given iteration-2 audit reports plus HEAD\n  When ownership-map-revalidation re-globs via git ls-files and recounts\n  Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>",
        "Scenario: Secrets gate green by mechanism\n  Given the schema pre-validation plus the .factory/ exclusion merged\n  When detect-secrets scans git ls-files on a clean checkout\n  Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only",
        "Scenario: Epic kickoff gated on validated artifacts\n  Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion\n  When epic-kickoff-gate completes\n  Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)"
      ],
      "title": "Validated decomposition and green-gate preconditions"
    },
    {
      "directionalInterfaces": [
        "Epic runner (owns runner/** + setup-testing files): dispatch.py split into modules each ≤500 lines with zero too-many-lines/complexity suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced re-exports); baseline.py compat shims deleted (or kept with in-repo consumer evidence + debt note); tests/runner/_factories_extras.py split with duplicate disables collapsed; each test removal/merge names its survivor; shift report or no-shift declaration emitted in the epic close-up.",
        "Epic checkers: shared stream helper in NEW checkers-owned _source_stream.py replacing the drift-list-pinned block list (grep-verified zero remaining copies), ZERO _base.py diff from this epic; register() keeps only the ADR-012 missing-beartype justification with no @beartype added (no_try_import register line skipped — semantic-owned); type-ignore[misc] removal attempted via shared typed base with retain-and-report fallback; _legacy_scan renamed with all call sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek line preconditioned on runner close-up; tests/checkers/_factories.py split by checker group with ParameterSet typing; W9704/W9738 callers emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic tests; 40 W9704 + 11 W9738 heuristic outcomes pinned.",
        "Epic semantic (sole _base.py writer): DecisionBackend Protocol decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with FakeBackend kwarg/env injection tests; dotted-path honored only under PYTEST_CURRENT_TEST with loader test pinning both behaviors; .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); read-only lint proven by hash-asserted zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra without sentence-transformers with loader-returns-None + one-warning proof (no hatch entry, .gitignore untouched); rule-echo on-any-element change at _base.py:238 with joined cache keys; merged deduped heuristic table; docs state backend + cache + no-go."
      ],
      "id": "M2",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Runner modernized without behavior drift\n  Given the runner + setup-testing scope from the validated map\n  When its items merge\n  Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record",
        "Scenario: Checkers modernized without behavior drift\n  Given the checkers epic scope with semantic exclusions\n  When its items merge\n  Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported",
        "Scenario: Semantic infrastructure ready for a future model\n  Given the ADR-009 no-go verdict\n  When the semantic epic merges\n  Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported"
      ],
      "title": "Subsystem modernization via three epics"
    },
    {
      "directionalInterfaces": [
        "Shift-report handoff contract: each epic emits a shift-report section or explicit no-shift declaration in its close-up report with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); epic-shift-report-collection is the first post-replan item and stays pending unless all three close-ups exist (fails open, never fabricates); golden-regen-hatch consumes only the handoff record; review record = regen-hatch report with key-by-key diff (or no-op attestation).",
        "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against the handoff shift report; golden + tool counts committed together; no blind regen ever.",
        "Final gate table: format exit code; lint per-tool results on scoped checkout; pytest counts (pass/skip/deselect); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without); golden hash equality or regen diff; lint.baseline []; docs reconciliation checklist with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)\n  When golden-regen-hatch runs\n  Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs",
        "Scenario: Iteration closes with evidence\n  Given all epic merges via the handoff record\n  When final-gate-validation completes\n  Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit"
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
      "description": "Whether any compliant decision model exists is unknown (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral — no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample, license decision, CPU benchmark).",
      "id": "U2"
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
      "description": "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for the ownership universe via git ls-files filtered to src+scripts+tests minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner with total equal to the recount. Confirm symbol exclusions (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test modules + TestSuppressionRerankerPipeline class block), planned-path reservations (incl. tests/checkers/conftest.py as reservation, not an owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin the exact stream read/decode block list + helper signature for the checkers epic. Output: validated map with revision map-<HEAD short SHA> + drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed} consumed by all three epics. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "ownership-map-revalidation",
      "title": "Re-validate unified ownership map at HEAD"
    },
    {
      "deps": [],
      "description": "Land the operator-approved exclusion so the lint gate is green on clean checkouts. Pre-validate the filters_used schema against the installed detect-secrets version first (should_exclude_file signature; list-pattern vs scalar form) and use the version-correct form; then insert the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. Verify: full git-ls-files detect-secrets scan exits 0 on clean checkout while a planted control secret still exits 1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk caveat (write-time redaction + periodic unfiltered audits). No other baseline edits.",
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
      "description": "Root-owned coordination checkpoint (report-only, zero repo writes). Confirm the three epics consumed the validated map revision + drift list, the pylint verdict is readable, and the .secrets.baseline exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave order (runner item in an earlier wave than the semantic pipeline item when runner is assigned, with the read-only merge-base verification rule), the shared-file single-writer table, and docs-row assignments from the drift list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin; semantic owns pipeline subsection; root owns ADR reconciliation via adr-formalization). Resolve any ownership dispute by amended assignment before epic waves scale. Output: gate report with consumed revision ID, per-epic ownership tables, wave order, docs assignments, and zero unresolved disputes (each resolved dispute cites its amended assignment reference).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "epic-kickoff-gate",
      "title": "Epic kickoff and ownership-dispute gate"
    },
    {
      "deps": [],
      "description": "Root-owned ADR lifecycle (docs only, root-owned files): overwrite the docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences ADRs matching this plan, create docs/adr/ADR-012.md for the register() exemption, add staleness notes to ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify: 12 ADR files each carry Context/Decision/Consequences or an explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment).",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "adr-formalization",
      "title": "Formalize ADRs 009-012 and reconcile stale ADRs"
    },
    {
      "deps": [
        "epic-kickoff-gate"
      ],
      "description": "Root-owned fan-in (report-only, zero repo writes). M2 replanAfter:true is the enforceable gate: the engine schedules this item only in a post-replan wave after M2 epic close-ups exist. Read the three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up is missing, the item stays pending (fails open — never fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff record has exactly 3 epic sections, each either a shift report or an explicit no-shift declaration.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "epic-shift-report-collection",
      "title": "Consolidate epic shift reports into handoff record"
    },
    {
      "deps": [
        "epic-shift-report-collection"
      ],
      "description": "Root-owned regen hatch, executed ONLY on a reviewed shift report in the handoff record (heuristic outcome change, e.g. joined-rule encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), verify byte-identical double run, review the added/removed diff key-by-key against the shift report's justification-class description, commit golden + tool counts together. If all three handoff sections declare no-shift, this item is a no-op verification (golden byte-identical). NEVER blind-regen. Output: regen report with key-by-key diff review (or no-op attestation) consumed by final-gate-validation.",
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
      "description": "Root-owned final validation (report-only, zero repo writes): format gate exit 0; lint gate green on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green (count + skips recorded); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it installed, 7 passed + 2 skipped without); golden byte-identical or regen-with-reviewed-diff per the hatch report; lint.baseline []; docs reconciliation verified with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Record final gate table for close-up. Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files) — fixes go back to items, never to baseline edits.",
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
    },
    {
      "assumption": "Integration gate contract is 9 collected, 0 failed with pre-commit env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands integration row is reconciled to this contract, not unconditional 9/9 or stale 7 pass.",
      "why": "tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional 9/9 fails on minimal envs while stale 7 pass under-reports."
    },
    {
      "assumption": "Iteration 3 ships semantic infrastructure only (DecisionBackend, tracked cache, FakeBackend, docs); the headline model swap is NOT complete at close-up and must not be claimed as such. Follow-up triggers: double-rated real brush-off sample repairing the 215/0 corpus defect, human Fastino license decision if GLiDE is recommended, CPU latency/RSS benchmark on the chosen runtime.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating; operator must approve infra-only close-up per review human-awareness item."
    },
    {
      "assumption": "Epics are first-class plan output for root tasks (same model as iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8 in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12, semantic ≤10 items) are enforced when each epic's own plan is reviewed.",
      "why": "The plan schema defines child-epic spawning for root tasks; epic-internal items live in child plans with their own review, not in the root item list."
    }
  ],
  "epics": [
    {
      "intent": "# epic-runner-modernize\n\nChild epic of `modernize`. Own per validated map: runner/** (src + tests + stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py, setup/install tests). Out of scope: checkers/**, semantic symbols, tests/data/** (read golden for verification only; NEVER write — regen is a root item), tests/checkers/**. Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement: remove all complexity suppressions by refactoring (dispatch.py 542-line disable -> split registry/strategies/parser-sets into modules each <=500 with single-source re-exports; no threshold raises). Delete dead compat (baseline.py peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting tests) unless external-consumer evidence is found in-repo (then record and keep). Remove redundant wrappers/fallbacks per audit rows. Split tests/runner/_factories_extras.py (511 lines; collapse the duplicate disables) by group.\n2. Test debloat per test-debloat-audit rows: merge overlapping baseline-diff/runner-stats/t3 parser-completeness coverage (exact duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting groups owned by runner (self-lint, config-consistency, noise-filter, private-imports scan, hardcoded-checkout live test) mapping each intent to golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename milestone-ID test files by behavior (keep class/function contract names where gates reference them).\n3. Keep test intent: every removal/merge names its survivor (golden scenario, assumption test, or retained unit test); default suite keeps a full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected survivor named).\n4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); the engine schedules this item in an earlier wave than the semantic pipeline item (order in kickoff report); record the merge HEAD for semantic's read-only merge-base verification. If unassigned, propose count/scope diffs in the close-up report for the root docs follow-up; never touch other sections.\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: golden 158 findings + tool counts byte-identical unless a reviewed regen is requested via shift report (root regenerates); lint.baseline stays [].\n\n## Acceptance\n- runner/** + setup-testing files have zero too-many-lines/complexity suppressions; all modules <=500 lines; dispatch registry still single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).\n- Compat shims deleted (or kept with in-repo consumer evidence + debt note).\n- Removed tests each map to a survivor; blocking-debt limbs from the audit either pinned by new tests or explicitly flagged.\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-runner-modernize"
    },
    {
      "intent": "# epic-checkers-modernize\n\nChild epic of `modernize`. Own per validated map: checkers/** (src + tests + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch, zero diff from this epic): checkers/_semantic.py+.pyi, _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo line (this epic makes ZERO _base.py edits — its stream helper lives in new checkers-owned _source_stream.py), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's register() disable line (semantic standardizes it alongside the patterns), tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block. Planned-path reservations for semantic modules are read-only. Out of scope: runner/**, tests/data/** (read-only), other test dirs, AGENTS.md (never touch). Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement on checkers/**: shared stream read/decode helper in NEW _source_stream.py replacing the drift-list-pinned block list (audit-estimated ~15; exact list + helper signature pinned at re-glob; grep-verified zero remaining copies); register() keeps the ADR-012 missing-beartype justification (no @beartype added; skip no_try_import_checker.py's register line — semantic-owned); type-ignore[misc] on mixin classes: attempt removal via a shared typed base, fallback retain with standardized justification + reported blocker (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path) with all call sites updated; trivial_wrapper_checker: remove dead _legacy_* exemptions unconditionally, remove the peek_fallback_tools exemption ONLY after reading the runner close-up confirming shim deletion (if runner kept it, keep the exemption); split or slim over-limit modules (never raise thresholds); fix .pyi fidelity/private-symbol rows from the audit.\n2. Test debloat per test-debloat-audit rows: split tests/checkers/_factories.py (1,393 lines) by checker group with ParameterSet typing and cases next to tests; inline the 10 local _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers; remove unused factory helpers; fix test naming toward test_<method>_given_<condition>_then_<expected> for touched files; remove never-testing-linting checker tests only if the audit lists them (with survivors).\n3. Joined-code extraction at W9704/W9738 call sites (this epic owns the caller files): extract all suppressed codes via existing patterns, normalize/sort/join ',' as the rule argument (bare-except keeps single symbol). The on-any-element matching lives in the semantic-owned body; either merge order converges to the same final state (extraction alone is echo-neutral under exact match; matching alone is a no-op for single codes), so no cross-epic ordering is needed — if outcomes shift, emit a shift report. Never edit check_if_meaningful itself.\n4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0 guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except the semantic-owned pipeline class block, which this epic does not touch).\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled corpora; lint.baseline stays [].\n\n## Acceptance\n- Zero copied stream blocks outside _source_stream.py; zero _base.py diff; register() functions carry only the ADR-012 justification; mixin misc suppressions removed or retained-with-justification per the attempt rule; no over-limit checker module with a disable.\n- _factories.py split with no behavior change; local helper duplicates eliminated; callers emit joined codes.\n- All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or with reviewed shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-checkers-modernize"
    },
    {
      "intent": "# epic-semantic-infrastructure\n\nChild epic of `modernize`. Implement the model-INDEPENDENT semantic infrastructure now; model wiring waits on the corpus-repair + license verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files: checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype, structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate + backend injection + rule-echo on-any-element matching for joined codes: _base.py:238 exact-match becomes any-element match over comma-joined sorted codes; backward-compatible no-op for single codes); _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in no_try_import_checker.py; pyproject [semantic] extra block + uv.lock regeneration (enumerated packaging exception, single writer; .gitignore untouched — legacy .cache lines stay, decisions file committed; NO hatch entry — tracked cache is consumer-runtime data, not wheel payload); docs (semantic-justification.md rewrite, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG user-visible); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block, new runtime-assumption modules under tests/assumptions/ (append-only; never touch root __init__ + 3 contract modules + test_pylint_cache_semantics.py). tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).\n\nProtocol with root: NEVER write tests/data/** (read golden for verification only); on heuristic shift emit shift report + CHANGELOG behavior description (root regenerates). AGENTS.md: ### Semantic justification pipeline subsection ONLY; verify read-only via git merge-base that its base contains the runner AGENTS.md merge when runner was assigned (else wait for the earlier engine wave); never touch Quick Commands/Tool Scope rows. No edits to tests/integration.py, tests/conftest.py. Runner touch: none. Emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n\n## Requirements\n1. Contracts (ADR-010): keep check_if_meaningful signature + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate (rejections never reach backend). semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins both). No patching globals/imports, no private imports.\n2. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model), secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh only (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to linted files; drop empty-files + stale-model. Concurrency per pylint writer-first verdict (read the merged verdict; if pylint-cache-assumptions unmerged, root item lands first — do not invent semantics). Must pass all tools incl. detect-secrets.\n3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but with no compliant model available the loader returns None (one warning, sentinel, heuristic stands). sentence-transformers dropped from [semantic] (proven: extra contains no sentence-transformers; uv.lock has no such edge for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Joined-rule cache keys + on-any-element matching owned here (extraction at call sites owned by checkers epic; either order converges). On shift: shift report + CHANGELOG, root regenerates.\n4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold tables into one deduped parametrized table (heuristic outcomes pinned); FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; delete vacuous `is None or ...` + ImportError-propagation test; mark the 4 pair tests slow (or delete with the reranker); modules <=500, no suppressions; never test linting. (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model ships) is allowed, not required.\n5. Docs: rewrite semantic-justification.md (heuristic-gated backend + tracked cache + no-go status), custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches backend; one call per unique pair; scoped cleanup; no retry storm.\n- Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled comments (or shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned, empty baseline.",
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
      "resolution": "secrets-baseline-exclusion lands the approved ^\\.factory/ filter in version-correct form after schema pre-validation (journals stay committed); final validation runs on scoped/clean checkout and cites mechanism + HEAD."
    },
    {
      "category": "adjacent",
      "description": "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8 problem-statement ADRs partly stale; design/ vs docs/adr location split.",
      "id": "TD3-A1",
      "resolution": "Decision rule applied at epic-kickoff-gate from the drift list; defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin, semantic owns pipeline subsection, root owns ADR reconciliation via the adr-formalization item (overwrite 009/010/011 stubs with full ADRs, create ADR-012.md, staleness notes on 001/005/006, docs/adr location cross-reference). Kickoff records assignments; unassigned rows stay with root."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules with disables, dead compat shims, duplicated test helpers, milestone-ID test names, hardcoded checkout paths — split by owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py (511, incl. duplicate-disable collapse); checkers owns tests/checkers/_factories.py (1393); semantic owns tests/checkers/test_semantic_check.py (506).",
      "id": "TD3-A2",
      "resolution": "Each epic resolves its owned rows per audit (register() disables exempt per ADR-012; mixin misc per attempt-with-fallback rule); each removal names a survivor; blocking-debt limbs pinned or explicitly flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "No model ships in iteration 3; intent's swap clause is deferred until a compliant model is proven. Epics build backend/cache infrastructure against FakeBackend + tracked cache; model wiring is a bounded follow-up once the verdict lands. Close-up must not claim the swap complete.",
      "context": "Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.",
      "decision": "Defer model implementation to a follow-up contingent on (a) double-rated real brush-off sample resolving the corpus-construction defect and (b) human Fastino license decision if GLiDE is recommended. Iteration 3 delivers everything model-independent: heuristic-first DecisionBackend + tracked cache infrastructure, runner/checkers debloat, docs reconciliation.",
      "id": "ADR-009",
      "title": "No-go-gated semantic implementation with infrastructure-first delivery"
    },
    {
      "consequences": "Backend/cache work proceeds against pinned contracts without waiting for the model verdict; a compliant model plugs in via get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path surface is test-only by construction, verified by a loader test.",
      "context": "Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending. The test-only dotted-path backend import would be an arbitrary-code-execution surface if honored in production lint.",
      "decision": "Adopt iteration-2 spike contracts as authoritative unless contradicted at HEAD: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1] with heuristic-first hard gate; tracked JSON array .python-setup-decisions.json at linted root (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint read-only with hash-asserted zero writes; explicit CI-guarded refresh (lockfile + merge + atomic); prune empty-files + stale-model; writer-first concurrency verdict from pylint-cache-assumptions (merge pending item first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint ignores it. A loader test pins both behaviors (honored under pytest; ignored with the marker removed).",
      "id": "ADR-010",
      "title": "Adopt iteration-2 semantic spike contracts as build baseline"
    },
    {
      "consequences": "Subsystem epics start with dispute-free ownership; no concurrent shared-file edits (single-writer table); AGENTS.md conflicts avoided by heading split + engine wave order; M3 close-out consumes a single handoff record gated by the M2 replan.",
      "context": "M4 audits merged with the unified 5-owner map but report completeness validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split, shared-file edits, packaging exceptions, and the epic-to-root shift-report handoff need machine-checkable definitions because no cross-epic dependency edges exist and agents must never run git writes.",
      "decision": "Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic epics in one wave. Epic assignment maps setup-testing files to epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py + setup/install tests). AGENTS.md split by exact rows with engine-enforced wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Shared-file single-writer table (no concurrent edits): checkers/_base.py = semantic only (checkers puts its stream helper in new checkers-owned _source_stream.py, zero _base.py diff); no_try_import_checker.py register() disable line + _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line); test_suppression file = checkers owns all lines except the TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper exemption list = checkers, with the peek_fallback_tools line preconditioned on reading the runner close-up (deleted iff runner confirms shim deletion). Packaging exception: semantic solely owns the pyproject [semantic] extra block + uv.lock regeneration (single writer, enumerated exception to root-owned repo-root files); .gitignore untouched (legacy .cache lines stay; decisions file committed); no hatch entry (tracked cache is consumer-runtime data, not wheel payload). Shift-report handoff: each epic emits a shift-report section or explicit no-shift declaration in its close-up report; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); root epic-shift-report-collection is the first post-replan item, stays pending unless all three close-ups exist, and consolidates the handoff record that golden-regen-hatch consumes.",
      "id": "ADR-011",
      "title": "Validated-map epic decomposition with defined AGENTS split and shift handoff"
    },
    {
      "consequences": "register() disables remain as documented exemptions counted as exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal is attempt-with-fallback: either clean removal or a standardized retained justification, both verifiable.",
      "context": "Every checker register(linter: PyLinter) omits @beartype with a missing-beartype disable citing PyLinter runtime-unavailability / circular import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import; dropping the disable retriggers the custom missing-beartype checker. Separately, 4 mixin checkers suppress a SourceRootMixin.options vs BaseChecker.options conflict (e.g. beartype_checker.py:21) whose removability via a shared typed base is unproven and may be blocked by pylint typing.",
      "decision": "Retain the missing-beartype disable on all register() functions with a standardized justification (PyLinter is a pylint internal type unavailable at runtime for beartype; circular import). Annotation stays PyLinter under TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on mixin classes is attempted via a shared typed base; if pylint typing blocks removal, retain with the standardized justification and report the blocker — both outcomes satisfy the epic.",
      "id": "ADR-012",
      "title": "register() missing-beartype exemption for PyLinter circular import"
    }
  ]
}

## Task Status
iteration: 3
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
