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
        "_RuffFormatLintTool(LintTool) in runner/dispatch.py: build_command(config,_path,_exclude)->['ruff','format','--check','--config',<ruff.toml>,...paths] (check mode, default); build_format_command(config,_path,_exclude)->['ruff','format','--config',<ruff.toml>,...paths] (mutating). cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command. runner/_config.py maps 'ruff format'->ruff.toml; _config_flag_for handles it. No if-spec.name in _build_command.",
        "Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13); RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} intentional. Tests import from python_setup_lint.runner. Migration: test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3 assert STATISTICS set; fakes invariants assert EXPECTED set.",
        "Docs contract: every 13-site -> 14 by grep enumeration (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:58; docs/overlays.md:3; docs/tutorials.md:26; runner/__init__.py:3; cli.py:314; any factory/docstring hit). tool_counts.json asserted 14 keys incl 'ruff format':0 (already true; verify, not rewrite)."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green per-gate\n  Given clean HEAD with empty lint.baseline\n  When format gate exits 0 (173 files formatted), lint gate exits 0 (SIM102+R0914+C0208 fixed, secrets clean or operator-excluded with evidence), `pytest -q` exits 0 (6 fixed, no new failures), integration exits 0\n  Then all gates pass and lint.baseline stays []",
        "Scenario: Lint check-only without --fix\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config config/ruff.toml, and the mutating format cmd (phase-1a) runs only under --fix without --check",
        "Scenario: Registry single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit and no hardcoded 13 remains"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py sole site, 11 helpers with pinned names/signatures: copy_sample_project(tmp_path: Path)->Path; git_init_and_stage(project: Path)->None (test/test@test + add .); shipped_config_paths()->dict[str,Path]; make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd: Path)->None (Test/test@example.com, -q, no add); write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project: Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. Consumers: integration->{copy,git_init_and_stage,make_runner_config,build_overlay,ensure_precommit,install_twice}; conftest->{shipped_config_paths}; _autofix->{git_init_bare,write_project_file,stage_file,commit_all}. Test class/function names unchanged; helper renames per matrix only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] keeps tool order (no sort, synthetic-empty safe); serialize_write/_diff_keys sort by finding_key; caller test_setup_new_and_lint asserts len(findings)!=0 post-collect and retains first-run [CRASH]-absent + SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel; assert_matches_golden Counter-multiset + UPDATE guard (fail under CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]') used by overlay test; read_oracle_rules, assert_oracle_coverage, assert_tool_coverage retained."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once per matrix\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each of the 11 helpers is defined exactly once there, duplicates in conftest.py and _autofix_helpers.py are deleted, each consumer imports only its mapped subset, and stay-symbols (_PostFixFakeRunCmd, canary, _FIX_TOOL_NAMES) are untouched",
        "Scenario: Integration gate within single limit\n  Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with both suppressions removed (:12 too-many-lines via extraction, :202 too-many-locals via overlay builder), test names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening via caller asserts\n  Given the committed golden\n  When integration runs plus synthetic drift injection\n  Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, regen twice byte-identical, and the overlay test uses the shared slicer"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "Eval contract: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall; corpus = threshold 30+50 + brush-off/meaningful tables + N real repo suppressions (target >=100), rubric (specific technical justification vs placeholder/deferral/brush-off), per-source breakdown; report per-candidate at 0.5/0.6/0.7 {precision, recall, p50/p95 latency, RSS, recommendation}; all matrix candidates scored or explicitly excluded.",
        "Cache contract (spike-chosen): tracked JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; unified entry {justification, rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen?}; key (justification,rule,model) with secrets-clean encoding (no bare hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime assert); refresh command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model.",
        "Pylint/concurrency contract (writer-first): identify writer (checker open/close vs runner post-process) + write timing (per-visit vs end-of-run) + --path scoping across 3 sequential pylint invocations (no -j, no contention); verdict derives crash-safe lock/merge/atomic vs no-lock runner merge vs jobs=1/sidecars-if--j."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Model choice is evidence-based over all candidates\n  Given the labelled corpus (>=100, rubric + per-source split)\n  When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 (or records explicit exclusion)\n  Then the report cites the 90/95/85 bars per threshold and recommends the smallest compliant model+prompt+threshold + veto-vs-replace mode, or a no-go with evidence",
        "Scenario: Cache deterministic-given-cache+model\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present-miss, and cache-hit\n  Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash",
        "Scenario: Writer and timing pinned before lock design\n  Given pylint 4.x invocation tests\n  When writer + timing + --path scoping are pinned\n  Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Replan input contract: audits emit structured tables in item reports (durable orchestration records); iteration-3 replan consumes reports + re-globs HEAD for validation only (no committed map; fact-finders write nothing). Owner enum {runner,checkers,setup-testing,semantic,root}. File universe src/**+scripts/**+tests/** incl .pyi/conftest/__init__/_factories (stub follows .py); config/docs/tests/data root-owned unless listed. Every universe file appears exactly once with exactly one owner.",
        "File ownership separate from symbol exclusions: ownership is whole-file; skips live in an exclusion column (src: _semantic.py+.pyi, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline). Planned-path reservations (new backend/cache modules, epic conftest/runtime modules) listed separately, not globbed."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried with disjoint ownership\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts universe file is listed with violations plus exactly-once owner, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved",
        "Scenario: Test redundancy inventoried with pinning limbs\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map",
        "Scenario: Replan input is complete and validatable\n  Given both audit reports plus HEAD\n  When the iteration-3 replan re-globs HEAD\n  Then every universe file validates against exactly one owner, exclusions reference existing symbols, and reservations name only planned paths"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + 90/95/85 bars is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark exists here; corpus size/rubric undefined until spike.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 on >=100 labelled corpus with rubric; smallest compliant model/prompt/threshold + veto-vs-replace or no-go",
        "decision-runtime-pinning (test-assumptions, conditional on eval): py3.14 CPU wheels + import/device/offline + custom-code pinning for the chosen runtime (skip on no-go)"
      ]
    },
    {
      "description": "Cache key encoding, schema extras, prune/update semantics, writer identity/timing, and --path scoping are unknown. Open: secrets-clean encoding (not full hex), version/prompt-hash/last-seen fields, refresh command, CI guard, checker- vs runner-side writer, write timing, sweep scope.",
      "id": "U2",
      "spikeOutlines": [
        "pylint-cache-assumptions (test-assumptions, writer-first): pin writer + timing + --path scoping across sequential invocations; verdict derives lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j",
        "cache-design-spike (poc on temp copies, consumes writer verdict): unified schema + spike-chosen encoding + prune + refresh/CI/isolation + deterministic-given-cache+model proof with hash-asserted zero normal-lint writes"
      ]
    },
    {
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured; subsystem epics need the unified map with file-vs-symbol separation and planned-path reservations.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder, single owner of unified map + exclusion column + reservations)",
        "test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning inventory)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command -> check mode with --check --config; build_format_command -> mutating mode; register in _strategy_for; map 'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a calls build_format_command, normal pass calls build_command. No if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES + FORMATTER_ONLY + STATISTICS/RECORD sets owned by dispatch.py, re-exported via runner/__init__; migrate 6 failing tests (test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3 to STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED set). (3) Docs: enumerate every 13-site by grep (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:58; docs/overlays.md:3; docs/tutorials.md:26; runner/__init__.py:3; cli.py:314; any factory/docstring hit) -> 14; verify tool_counts.json already 14 keys (assert, not rewrite). Verify per-gate exits: format 0, lint 0, pytest -q 0, integration 0; git status --porcelain empty after `uv run lint` (no --fix); spy asserts normal-pass cmd has --check+--config and phase-1a omits --check (fix-only); golden byte-identical; baseline [].",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 60,
      "slug": "runner-format-contract",
      "title": "Ruff format strategy and 14-tool registry fix"
    },
    {
      "deps": [],
      "description": "Behavior-preserving refactors, baseline stays []: (1) coverage.py:196 SIM102 nested-if -> single `if a and b`. (2) cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). (3) tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence type. (4) Factory-journal detect-secrets: triage on clean checkout; if environmental (tracked runtime journals), record evidence + gate command showing clean, and file operator/engine exclusion request (no src workaround); if real secret, redact/rotate. Verify: lint gate green except operator-owned secrets exclusion (with evidence); pytest + integration show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 35,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102, too-many-locals, C0208, triage secrets"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md, docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per matrix (11 helpers): copy_sample_project(tmp_path)->Path [ex _copy_sample]; git_init_and_stage(project)->None [ex _init_git, test/test@test + add .]; shipped_config_paths()->dict [ex _shipped_config_paths]; make_runner_config(project)->RunnerConfig [ex _make_config, minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing]; git_init_bare(cwd)->None [ex _git_init, Test/test@example.com -q no add]; write_project_file(cwd,rel,content)->Path [ex _write_file]; stage_file(cwd,rel)->None [ex _stage]; commit_all(cwd,msg)->None [ex _commit_all]; build_pylint_overlay_config(project,disable_rule)->Path [extract overlay 217-240]; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. Delete duplicates in conftest.py + _autofix_helpers.py; per-consumer imports only (integration->{copy,git_init_and_stage,make_runner_config,build_overlay,ensure_precommit,install_twice}; conftest->{shipped_config_paths}; _autofix->{git_init_bare,write_project_file,stage_file,commit_all}). Test class/function names unchanged (helper renames per matrix only). Budget: >=161 removed (661-><=500 single threshold): helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163. Remove BOTH suppressions (:12 too-many-lines via extraction; :202 too-many-locals via overlay builder). Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
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
      "description": "Tests-only hardening, no blind regen (CI guard enforced). No __CRASH__ sentinel and no sort-in-collect: keep collect tool-order; sorting stays in serialize_write + _diff_keys; add caller asserts in test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH] absent + SKIPPED only package_name retained); keep Counter-multiset diff + UPDATE guard + oracle/tool coverage; use slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test; extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe). Verify: integration + test_golden pass; golden+counts byte-identical; regen twice byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden via caller asserts and shared slicer"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license, params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output feeds eval-poc (all candidates) + cache spike (model-id/rev format).",
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
      "description": "No committed code; report only (temp venv/copy permitted, network inside spike only). Corpus: threshold 30 meaningful + 50 meaningless + brush-off/meaningful tables + N real repo suppressions (target >=100 total); label rubric: specific technical justification vs placeholder/deferral/brush-off; report per-source breakdown. Score ALL matrix candidates at 0.5/0.6/0.7 (or record explicit exclusion: license/wheels/unobtainable): accuracy, meaningless-precision, meaningful-recall, CPU p50/p95 latency + RSS. Compliant = >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall. Recommend smallest compliant model+prompt+threshold + veto-vs-replace mode, or no-go with evidence.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "model-eval-poc",
      "title": "CPU accuracy/latency evaluation over all candidates"
    },
    {
      "deps": [
        "model-candidate-matrix",
        "pylint-cache-assumptions"
      ],
      "description": "Prototype on temp copies only; no committed files. Consumes writer-first verdict. Design unified tracked schema: JSON array sorted by (rule,justification,model), indent=2 sort_keys; entry {justification, rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen?}; key (justification,rule,model) with spike-chosen secrets-clean encoding (no bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH isolation). Prune: drop empty-files + stale-model (+age policy if defined). Prove deterministic-given-cache+model: heuristic-rejected identical False; accepted+hit == persisted verdict; accepted+miss+absent == heuristic True; normal lint zero writes (hash/mtime assert).",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "cache-design-spike",
      "title": "Tracked cache schema and determinism prototype"
    },
    {
      "deps": [],
      "description": "Writer-first reframing (runner is sequential, pylint specs pass no -j: no contention today). Identify FIRST: writer (checker open()/close() during pylint subprocess vs runner post-process merge) + write timing (per-visit vs end-of-run) + --path scoping across pylint/pylint-pyi/pylint-tests sequential invocations. Then derive: lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side post-merge) vs jobs=1/sidecars only if -j introduced. Add tests/assumptions/test_pylint_cache_semantics.py (no_external_api, test_<api>_given_<condition>_then_<expected>). No src changes. Verdict feeds cache-design-spike.",
      "kind": "test-assumptions",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-cache-assumptions",
      "title": "Pin pylint writer, timing, and path scoping"
    },
    {
      "deps": [
        "model-eval-poc"
      ],
      "description": "Conditional on eval recommendation (no-go -> report-only skip, no file). For the chosen runtime only: verify py3.14 CPU wheels (linux/mac/win), import/device/offline contract (CPU fallback, no network on hit), and custom-code pinning (vendored revision, never unpinned trust_remote_code). Add tests/assumptions/test_decision_runtime_contracts.py (no_external_api, test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance: wheels/APIs pinned or explicit blocker recorded for iteration-3 epic.",
      "kind": "test-assumptions",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "decision-runtime-pinning",
      "title": "Pin chosen runtime wheels and API contracts"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit src/** + scripts/** vs CodingRules/AGENTS. Output in item report (durable replan input): rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint file-ownership map (owner enum {runner,checkers,setup-testing,semantic,root}; universe src/**+scripts/**+tests/** incl .pyi/conftest/__init__/_factories, stub follows .py; config/docs/tests/data root-owned unless listed; every universe file exactly once) + separate symbol-exclusion column (_base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations (new backend/cache modules). Reads final HEAD + beartype report. Single owner of the map; test audit aligns via inter-dep.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "coding-rules-audit"
      ],
      "description": "Read-only; zero repo writes. Audit tests/**. Output in item report: rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag) + symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) + planned-path reservations (epic conftest/runtime modules). Owner column aligned to coding audit's unified map via inter-dep (file ownership separate from symbol skips). Iteration-3 replan consumes both reports + HEAD re-glob validation.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material. Model may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only today) by design.",
      "disposition": "confirm with human",
      "why": "Makes preservation mechanically testable while allowing the swap; tightening must be operator-visible, not mistaken for regression."
    },
    {
      "assumption": "Git-stored decision cache lives in the linted repo (proposed .python-setup-decisions.json next to lint.baseline); weights stay in user model cache, never git. Spikes assume this path with DECISIONS_PATH isolation; operator confirms filename/location before iteration-3 implementation.",
      "disposition": "confirm with human",
      "why": "Decisions must reproduce in CI without the model; weights are 0.03-0.8GB with own licenses; committed file affects gitignore/hatch/consumers/secrets."
    },
    {
      "assumption": "Dev/CI do not install the `semantic` extra; gates run heuristic + cache hits. Real-model tests are slow + with_real_api, never in the default suite.",
      "why": "Matches current venv (no torch/transformers); keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration behavior contracts are retained, not removed.",
      "disposition": "confirm with human",
      "why": "Removes gate-duplicating tests without deleting the fit-for-purpose contract."
    },
    {
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes proceed Apache-first and exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for approval; if no candidate meets license + CPU + py3.14 + bars, the epic escalates.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial licensing by default."
    },
    {
      "assumption": "Gate contracts (paths/commands) do not change: tests/integration.py, `pytest -q`, integration, split format/lint gates until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1 mutation hazard) or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates pre-M1; split gates are the check-only workaround."
    },
    {
      "assumption": "Semantic epic record spawns in iteration 2; its implementation runs in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes report without replanning.",
      "why": "Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and pins the spawn wave."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker with a CPU-friendly small decision model + git-stored self-cleaning cache. Child epic of `modernize`. Record spawns iteration 2; implementation runs iteration 3 consuming spikes (candidate matrix, CPU eval, cache design, pylint semantics, runtime pinning).\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi + new private backend/cache modules (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache tests, tests/checkers/conftest.py, runtime modules under tests/assumptions/. Protocol: NEVER write tests/data/** (read golden for verification; on heuristic shift emit shift report + CHANGELOG description, root regenerates). AGENTS.md pipeline section only on HEAD containing M2 merge, never count lines. tests/assumptions append-only. No edits to tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.\n\n## Requirements\n1. Implement spike verdict: chosen model id/revision, noul prompt + criteria, threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall, or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial; Fastino needs human approval.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None. Public DecisionBackend Protocol decide(justification,rule,context)->float; DECISION_THRESHOLD + PROMPT_VERSION. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra/failure: heuristic + cache hits, one warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model) with spike-chosen secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh writes via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation. Sweep scoped to linted files; drop empty-files + stale-model. Must pass all tools incl. detect-secrets. Concurrency per writer-first verdict (checker vs runner-side, timing, --path scoping).\n5. Real suppressed codes: extract all codes, normalize/sort/join ',' as rule (bare-except keeps single symbol). Rule-echo rejects on any element. On shift: shift report + CHANGELOG, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` + ImportError-propagation test; modules <=500, no suppressions; never test linting.\n7. Docs: Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches model; one call per unique pair; scoped cleanup; no retry storm. Format/lint/pytest/integration green with empty baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass indistinguishable at _fix=False.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: _RuffFormatLintTool with check vs format modes, phase-1a mutates (fix-only), normal pass checks with shipped config."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 tests assert 13 vs 14 tools; SIM102 stub/coverage.py:196; R0914 cli.py:50 (23/20); C0208 _factories_extras.py:383 set-iteration; factory-journal detect-secrets flag. Empty baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool migration + docs enumeration) + baseline-violations-fix (SIM102 + locals split + C0208 sequence fix + secrets triage with evidence; exclusion is operator/engine action if environmental). Baseline stays []."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines (:12) + too-many-locals (:202) suppressions; helpers duplicated across integration/conftest/_autofix_helpers; _write_file orphaned in prior matrix.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, 11-helper matrix incl write_project_file, >=161 removed to <=500, both suppressions removed, golden byte-identical)."
    },
    {
      "category": "impacting",
      "description": "Golden drift: tool-order vs sort placement, len!=0/crash asserts unplaced, invented __CRASH__ sentinel, unused slice_tool_section with unpinned markers.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening: tool-order collect, serialize/diff sorting, caller len/crash asserts, no sentinel, slicer('[pylint]','[pylint-pyi]') in overlay test, no blind regen."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts + ImportError-propagation test; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic iteration-3 implementation (FakeBackend injection, merged table, modules <=500, vacuous tests deleted)."
    },
    {
      "category": "impacting",
      "description": "W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic and future model never see actually-suppressed codes.",
      "id": "TD2-I4",
      "resolution": "Resolved by semantic epic req5 (joined suppressed codes, echo on any element, shift report + root regen)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit/duplicated test infra: _factories.py 1393 lines, _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff + 3 runner files overlapping, test_golden.py 341 lines of helper-unit tests.",
      "id": "TD2-A1",
      "resolution": "Inventoried by test-debloat-audit; iteration-3 checkers/runner epics merge/split per CodingRules."
    },
    {
      "category": "adjacent",
      "description": "Legacy/compat and docs drift: _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py 500+ char rationale with self-suppression, rumdl tests/data-exclude hack, ADR design/ vs docs/adr split.",
      "id": "TD2-A2",
      "resolution": "Inventoried by audits; iteration-3 epics remove/fix."
    }
  ],
  "adrs": [
    {
      "consequences": "`uv run lint` without --fix is check-only (not hermetic: subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split format/lint gates reunify after merge. 14-tool docs/tests stabilize on one registry.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config (default 88 vs shipped 130), dirtying ~109 files; phase-1a (mutate) and normal pass (check) both call build_command with _fix=False so a generic flag cannot distinguish them; 6 tests + docs assert 13 vs 14-entry TOOLS.",
      "decision": "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy pattern: build_command emits check mode (ruff format --check --config <ruff.toml>) by default; build_format_command emits mutating mode. cli.py phase-1a calls build_format_command, normal pass calls build_command. Map 'ruff format'->ruff.toml in runner/_config.py + _config_flag_for. Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13, all but ruff format), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} documented intentional. Tests import from python_setup_lint.runner.",
      "id": "ADR-005",
      "title": "Ruff format strategy with explicit check vs format modes"
    },
    {
      "consequences": "Golden stays byte-identical; crash/empty sensitivity explicit in caller; overlay uses shared slicer; no invented sentinel; no blind regen.",
      "context": "Merged collect_findings runs a second pipeline on the private record-parser subset (avoids formatter pollution and baseline capture, not a second run). It returns tool-order, sorts only in serialize, and no code emits __CRASH__ (crashes surface as [CRASH] text; parsers return [] on garbage).",
      "decision": "Ratify private-subset second run as intentional. No Finding-level __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order (synthetic-empty safe); sorting lives in serialize_write + _diff_keys. len(findings)!=0 asserted by the caller after collect. slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test (FAILED/PASSED robust).",
      "id": "ADR-006",
      "title": "Golden hardening via caller asserts, no crash sentinel"
    },
    {
      "consequences": "Lint deterministic-given-cache+model: heuristic-rejected identical False; accepted+hit equals persisted model verdict; accepted+miss+absent equals heuristic True. Cache updates explicit, reviewable, CI-guarded. Iteration 3 implements against spike verdict.",
      "context": "Current cache is per-machine, gitignored, unbounded, 64-bit truncated keys, no cleanup. A lint-written tracked cache would be non-hermetic; full-hex keys would trip detect-secrets.",
      "decision": "Tracked cache is source of truth; normal lint is read-only (cache-hit + heuristic), zero writes asserted by file hash/mtime. Writes only via explicit refresh command/flag (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema unified with epic (justification,rule,model,decision,files + spike-decided version/prompt-hash/last-seen). Prune drops empty-files + stale-model (+age policy if spike defines).",
      "id": "ADR-007",
      "title": "Read-only lint with spike-chosen secrets-clean cache"
    },
    {
      "consequences": "One replan point (M4) consumes durable report tables + HEAD validation; subsystem epics spawn in iteration 3 with disjoint ownership; semantic implementation follows spike verdicts. No concurrent shared-infra edits.",
      "context": "Remaining scope spans runner/checkers/setup plus semantic swap. Audits must read final post-M2 HEAD; M3 spikes and M4 audits run in parallel with one replan gate.",
      "decision": "Iteration 2: green baseline, infra completion, spikes, audits. Semantic epic record spawns now; its implementation is scheduled iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from the unified map. Replan input = audit item-report tables (durable orchestration records) + HEAD re-glob for validation (no committed map; fact-finders write nothing). Single replanAfter on M4 only.",
      "id": "ADR-008",
      "title": "Single-replan progressive decomposition with report-fed replan"
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
