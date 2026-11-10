# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "_RuffFormatLintTool(LintTool) in runner/dispatch.py: build_command(config,_path,_exclude)->check mode ['ruff','format','--check','--config',<resolved ruff.toml>,...paths] (default); build_format_command(...)->mutating mode without --check. cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command. runner/_config.py maps 'ruff format'->ruff.toml; _config_flag_for handles it. No if-spec.name in _build_command.",
        "Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13); RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} intentional. Tests import from python_setup_lint.runner. Migration: test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3 assert STATISTICS set; fakes invariants assert EXPECTED set.",
        "Docs contract: every in-scope tool-count site -> 14 by grep `13[ -]?tools?|all_13|== 13` with per-hit disposition: AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit. EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist: MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted 14 keys incl 'ruff format':0 (verify, not rewrite)."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green per-gate\n  Given clean HEAD with empty lint.baseline\n  When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict\n  Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance",
        "Scenario: Lint check-only without --fix\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check",
        "Scenario: Registry single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py sole site, 11 helpers with pinned names/signatures: copy_sample_project(dest_parent: Path)->Path (dest_parent.mkdir(parents=True, exist_ok=True); copytree tests/data/minimal_sample_project -> dest_parent/'project'; returns project path); git_init_and_stage(project: Path)->None (test/test@test + add .); shipped_config_paths()->dict[str,Path]; make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd: Path)->None (Test/test@example.com, -q, no add); write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project: Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py consumes make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged; helper renames per matrix only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] keeps tool order (no sort, synthetic-empty safe); sorting in serialize_write + _diff_keys; caller test_setup_new_and_lint asserts len(findings)!=0 post-collect and retains first-run [CRASH]-absent + SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel; assert_matches_golden Counter-multiset + UPDATE guard (fail under CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]') used by overlay test; read_oracle_rules, assert_oracle_coverage, assert_tool_coverage retained. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once per matrix\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched",
        "Scenario: Integration gate within single limit\n  Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening via caller asserts\n  Given the committed golden\n  When integration runs plus synthetic drift injection plus temp-copy double-collect\n  Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "Eval contract: decide(justification,rule,context)->float P(meaningful) in [0,1]; mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (spike uses current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto: final=heuristic(text) AND (prob>=threshold) (model only flips True->False; heuristic-False never reaches model); replace: final=(prob>=threshold), heuristic deleted. Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric (specific technical justification vs placeholder/deferral/brush-off); per-source + per-stratum breakdown. Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall apply to the heuristic-accepted stratum (overall also reported). Report per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored or explicitly excluded.",
        "Cache contract (spike-chosen): tracked JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; unified entry {justification, rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen?}; key (justification,rule,model) with secrets-clean encoding (no bare hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime assert); refresh command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model.",
        "Pylint/concurrency contract (writer-first): identify writer (checker open/close vs runner post-process) + write timing (per-visit vs end-of-run) + --path scoping across 3 sequential pylint invocations (no -j, no contention); verdict derives crash-safe lock/merge/atomic vs no-lock runner merge vs jobs=1/sidecars-if--j."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Model choice is evidence-based over all candidates\n  Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)\n  When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)\n  Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence",
        "Scenario: Cache deterministic-given-cache+model\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present-miss, and cache-hit\n  Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash",
        "Scenario: Writer and timing pinned before lock design\n  Given pylint 4.x invocation tests\n  When writer + timing + --path scoping are pinned\n  Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Replan input contract: audits emit structured tables in item reports (engine-durable orchestration records: items/*/assignment + wave reports + decisions/, readable at replan per the task status contract); iteration-3 replan consumes reports + re-globs HEAD for validation only (no committed map; fact-finders write nothing; escape hatch = kind change to committed artifact if the engine ever drops reports). Owner enum {runner,checkers,setup-testing,semantic,root}. Ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/** (stubs/conftest/__init__/_factories included; stub follows .py). Root-owned group (epics read-only): tests/data/** (golden, minimal_sample, oracles; golden regen only by root item), config/**, docs/**, repo-root files. Every universe file appears exactly once with exactly one owner; root-owned listed as a group.",
        "File ownership separate from symbol exclusions: ownership is whole-file; skips live in an exclusion column (src: _semantic.py+.pyi, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline). Planned-path reservations (new backend/cache modules, epic conftest/runtime modules) listed separately, not globbed."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried with disjoint ownership\n  Given CodingRules.md and AGENTS.md\n  When the audit completes on final HEAD (M1+M2 merged)\n  Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved",
        "Scenario: Test redundancy inventoried with pinning limbs\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map",
        "Scenario: Replan input is complete and validatable\n  Given both audit reports plus HEAD\n  When the iteration-3 replan re-globs HEAD\n  Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + 90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark exists here; mapping/modes/metric now pinned, corpus deduped + stratified by the spike.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto + replace modes on >=100 deduped corpus with rubric; compliance on heuristic-accepted stratum; smallest compliant model/prompt/threshold+mode or no-go",
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
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured; subsystem epics need the unified map with file-vs-symbol separation, root-owned groups, and planned-path reservations.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of unified map + exclusion column + reservations)",
        "test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning inventory)"
      ]
    },
    {
      "description": "detect-secrets flags on clean checkout are of unknown source: tracked factory runtime journals (environmental) vs a real secret. The exclusion mechanism (engine config vs gate flag) is also unknown, so M1 lint-green cannot be defined for that tool until triaged.",
      "id": "U4",
      "spikeOutlines": [
        "secrets-triage-spike (fact-finder, no repo writes): clean-checkout scan, flagged files + sha256 + verdict environmental-vs-real + exact exclusion mechanism; human-async operator request if environmental"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command -> check mode (--check + --config resolved ruff.toml); build_format_command -> mutating mode; register in _strategy_for; map 'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a calls build_format_command, normal pass calls build_command. No if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES + FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py, re-exported via runner/__init__; migrate the 6 named tests (test_lint_runner set+count; _factories_extras len+id; stats + t3 to STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; _factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit). CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted. Assert tool_counts.json already 14 keys (not rewrite). Verify: format/lint/pytest/integration exit 0; git status --porcelain empty after `uv run lint` (no --fix); spy asserts normal-pass cmd has --check + --config with resolved existing path (composed temp accepted) and phase-1a omits --check (fix-only); golden byte-identical; baseline [].",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 60,
      "slug": "runner-format-contract",
      "title": "Ruff format strategy and 14-tool registry fix"
    },
    {
      "deps": [
        "runner-format-contract"
      ],
      "description": "Serialized after runner-format-contract (shared cli.py ownership; applies onto the phase-1a call-site shape). Behavior-preserving refactors, baseline stays []: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif TypeAlias + nested if AssignName) -> single combined condition. (2) cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). (3) tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). Verify: lint gate reports zero violations in src/** and tests/**; pytest + integration show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 35,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102, too-many-locals, C0208"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. On clean checkout run the declared lint gate / detect-secrets scan; capture every flagged file + sha256 + baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify the exact exclusion mechanism (engine config vs gate command flag) + evidence hashes, and record the operator/engine exclusion request as human-async (M1 dev acceptance does not wait on it). If real: specify redact/rotate follow-up. Output feeds M1 acceptance + U4.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-triage-spike",
      "title": "Triage detect-secrets factory-journal flags"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md, docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir parents, copytree tests/data/minimal_sample_project -> dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex _shipped_config_paths]; make_runner_config(project)->RunnerConfig [minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex _write_file]; stage_file(cwd,rel)->None [ex _stage]; commit_all(cwd,msg)->None [ex _commit_all]; build_pylint_overlay_config(project,disable_rule)->Path [extract overlay 217-240]; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py uses make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged. Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202 stale too-many-locals disable directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
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
      "description": "Tests-only hardening, committed files never mutated by proofs. No __CRASH__ sentinel and no sort-in-collect: keep collect tool-order; sorting stays in serialize_write + _diff_keys; add caller asserts in test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH] absent + SKIPPED only package_name retained); keep Counter-multiset diff + UPDATE guard + oracle/tool coverage; use slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test; extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via temp-copy double-collect: collect+serialize on two fresh temp copies, sha256 hashes equal each other and equal committed golden hash. UPDATE_GOLDEN=1 never touches committed files except reviewed regen. Verify: integration + test_golden pass; golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden via caller asserts and shared slicer"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license, params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output feeds eval-poc (all candidates) + cache spike (model-id/rev format) + runtime pinning.",
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
      "description": "No committed code; report only (temp venv/copy permitted, network inside spike only). Mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto final=heuristic AND (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric: specific technical justification vs placeholder/deferral/brush-off; per-source + per-stratum breakdown. Score ALL matrix candidates at 0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy, meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall) apply to the heuristic-accepted stratum (overall also reported). Recommend smallest compliant model+prompt+threshold+mode, or no-go with evidence.",
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
        "baseline-violations-fix",
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "runner-format-contract"
      ],
      "description": "Read-only; zero repo writes. Audit src/** + scripts/** vs CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item report (engine-durable replan input): rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint file-ownership map over the ownership universe (src+scripts+tests minus tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub follows .py; tests/data + config + docs as root-owned group) + symbol-exclusion column (_base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations (new backend/cache modules). Single owner of the map; test audit aligns via inter-dep. Reads final HEAD + beartype report + secrets-spike verdict.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "coding-rules-audit",
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit tests/** (minus tests/data, root-owned). Output in item report: rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag) + symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) + planned-path reservations (epic conftest/runtime modules). Owner column aligned to coding audit's unified map via inter-dep (file ownership separate from symbol skips). Iteration-3 replan consumes both reports + HEAD re-glob validation.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    },
    {
      "deps": [
        "baseline-violations-fix"
      ],
      "description": "Close the M1 green-baseline tail: wave-2 report lists lint still red, and the two W9704 sites from infra notes (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore site) were never owned by any item (TD2-B2 omitted them). Steps: (1) Reproduce current failures via the declared gates (format check + 13-tool lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations. (2) Fix with justification-comment-only edits (no behavior change; red-test-exempt like baseline-violations-fix): strengthen trailing justifications so the justification checker accepts. If additional violations appear, fix only if trivially behavior-preserving, else record as debt in the report — do not balloon scope. FORBIDDEN: lint.baseline edits (stays []), tests/data/** changes, golden regen, unrelated refactors, .secrets.baseline, factory records. Secrets-triage verdict is human-async and out of scope. Verify: lint gate zero violations in src/** and tests/**; `pytest -q` + integration show no new failures; golden byte-identical; touched files format-clean.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 5,
      "slug": "remaining-lint-violations-fix",
      "title": "Fix remaining src/tests lint violations (W9704 tail)"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material. Model may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only today) by design; SEMANTIC=1 golden will shift with shift report + CHANGELOG + root regen.",
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
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for approval; if no candidate meets license + CPU + py3.14 + bars, the epic escalates.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial licensing by default; operator must see the gating criterion before the eval verdict."
    },
    {
      "assumption": "Gate contracts (paths/commands) do not change: tests/integration.py, `pytest -q`, integration, split format/lint gates until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1 mutation hazard) or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates pre-M1; split gates are the check-only workaround."
    },
    {
      "assumption": "Semantic epic record spawns in iteration 2; its implementation runs in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes report without replanning.",
      "why": "Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and pins the spawn wave."
    },
    {
      "assumption": "Factory-journal detect-secrets hits are triaged by secrets-triage-spike (environmental vs real with hash evidence). M1 dev acceptance is zero violations in src/** and tests/**; any factory-journal exclusion is operator/engine action tracked as human-async and never blocks dev items.",
      "disposition": "verify via secrets-triage-spike",
      "why": "Isolates the environmental unknown from dev stories per uncertainty containment; M1 green must not depend on out-of-band operator action."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker with a CPU-friendly small decision model + git-stored self-cleaning cache. Child epic of `modernize`. Record spawns iteration 2; implementation runs iteration 3 consuming spikes (candidate matrix, CPU eval, cache design, pylint semantics, runtime pinning).\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi + new private backend/cache modules (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache tests, tests/checkers/conftest.py, runtime modules under tests/assumptions/. Protocol: NEVER write tests/data/** (read golden for verification; on heuristic shift emit shift report + CHANGELOG description, root regenerates). AGENTS.md pipeline section ONLY (Semantic justification pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1 owns all count lines); never touch count lines (:9,43,63,92,93) or counts table (:10-11). tests/assumptions append-only. No edits to tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.\n\n## Requirements\n1. Implement spike verdict: chosen model id/revision, noul prompt + criteria, threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall on the heuristic-accepted stratum, in the recommended mode (veto vs replace), or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial; Fastino needs human approval.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None. Public DecisionBackend Protocol decide(justification,rule,context)->float with spike-pinned mapping (justification=primary, rule=joined codes, context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra/failure: heuristic + cache hits, one warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model) with spike-chosen secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh writes via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation. Sweep scoped to linted files; drop empty-files + stale-model. Must pass all tools incl. detect-secrets. Concurrency per writer-first verdict.\n5. Real suppressed codes: extract all codes, normalize/sort/join ',' as rule (bare-except keeps single symbol). Rule-echo rejects on any element. On shift: shift report + CHANGELOG, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one deduped parametrized table; FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` + ImportError-propagation test; modules <=500, no suppressions; never test linting.\n7. Docs: Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches model; one call per unique pair; scoped cleanup; no retry storm. Format/lint/pytest/integration green with empty baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass indistinguishable at _fix=False.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: _RuffFormatLintTool with check vs format modes, phase-1a mutates (fix-only), normal pass checks with shipped config, registry single-sourced."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102 src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50 (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool migration + docs enumeration with grep disposition) + baseline-violations-fix serialized after it (SIM102 + locals split + C0208 sequence fix). Baseline stays []."
    },
    {
      "category": "blocking",
      "description": "detect-secrets flags factory-journal files on clean checkout; environmental vs real unverified, so M1 lint-green is undefined for that tool.",
      "id": "TD2-B3",
      "resolution": "Owned by secrets-triage-spike (fact-finder, report with file hashes + verdict + exclusion mechanism). Environmental -> operator/engine exclusion as human-async (M1 dev acceptance does not wait); real -> redact/rotate follow-up. M1 dev acceptance is zero violations in src/** and tests/**."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines (:12) + stale too-many-locals (:202, globally disabled in .pylintrc-tests:39) suppressions; helpers duplicated across integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs mkdir-parents.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, 11-helper matrix incl mkdir-parents copy, conftest def deleted with 2 import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction + :202 stale deleted directly, golden byte-identical)."
    },
    {
      "category": "impacting",
      "description": "Golden drift: tool-order vs sort placement, len!=0/crash asserts unplaced, unused slice_tool_section with unpinned markers, regen-twice would mutate committed files.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening: tool-order collect, serialize/diff sorting, caller len/crash asserts, no sentinel, slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy double-collect determinism proof, UPDATE_GOLDEN never touches committed files except reviewed regen."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts + ImportError-propagation test; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic iteration-3 implementation (FakeBackend injection, deduped merged table, modules <=500, vacuous tests deleted)."
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
      "consequences": "`uv run lint` without --fix is check-only (not hermetic: subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split format/lint gates reunify after merge. 14-tool docs/tests stabilize on one registry with historical CHANGELOG preserved.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config (default 88 vs shipped 130), dirtying ~109 files; phase-1a (mutate) and normal pass (check) both call build_command with _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS; _compose_ruff_config may return a temp path so spies must not match literals.",
      "decision": "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy pattern: build_command emits check mode (ruff format --check --config <resolved ruff.toml>) by default; build_format_command emits mutating mode. cli.py phase-1a calls build_format_command, normal pass calls build_command. Map 'ruff format'->ruff.toml in runner/_config.py + _config_flag_for. Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} documented intentional. Tests import from python_setup_lint.runner. Tool-count migration verified by grep with per-hit disposition, CHANGELOG historical exclusion, and MD013/130 allowlist.",
      "id": "ADR-005",
      "title": "Ruff format strategy with explicit check vs format modes"
    },
    {
      "consequences": "Golden stays byte-identical; crash/empty sensitivity explicit in caller; overlay uses shared slicer; no invented sentinel; committed files never mutated by determinism proofs.",
      "context": "Merged collect_findings runs a second pipeline on the private record-parser subset (avoids formatter pollution and baseline capture). It returns tool-order, sorts only in serialize, and no code emits __CRASH__ (crashes surface as [CRASH] text; parsers return [] on garbage). UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target them.",
      "decision": "Ratify private-subset second run as intentional. No Finding-level __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order (synthetic-empty safe); sorting lives in serialize_write + _diff_keys. len(findings)!=0 asserted by the caller after collect. slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen.",
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
      "consequences": "One replan point (M4) consumes durable report tables + HEAD validation; subsystem epics spawn in iteration 3 with disjoint ownership; semantic implementation follows spike verdicts. No concurrent shared-infra edits. No committed map to maintain; audits stay zero-write.",
      "context": "Remaining scope spans runner/checkers/setup plus semantic swap. Audits must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel with one replan gate. Review questioned whether item-report tables are durable enough to feed iteration-3 replan.",
      "decision": "Iteration 2: green baseline, infra completion, spikes, audits. Semantic epic record spawns now; its implementation is scheduled iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from the unified map. ARCHITECT DECISION on durability: item reports persist as engine-durable orchestration records (items/*/assignment + wave reports + decisions/), readable at replan per the task status contract; validation re-globs HEAD. No committed map; fact-finders stay zero-repo-write. Escape hatch (not default): if the engine ever drops reports, replan re-runs the audit queries or the kind changes to a committed artifact.",
      "id": "ADR-008",
      "title": "Single-replan progressive decomposition with report-fed replan"
    }
  ]
}`, `iteration: 2
amendments: 1
items:
  - runner-format-contract kind=dev wave=1 status=merged outlineRef=runner-format-contract
  - consolidate-integration-helpers-i2 kind=test-only wave=1 status=merged outlineRef=consolidate-integration-helpers
  - model-candidate-matrix kind=fact-finder wave=1 status=merged outlineRef=model-candidate-matrix
  - pylint-cache-assumptions kind=test-assumptions wave=1 status=running outlineRef=pylint-cache-assumptions
  - baseline-violations-fix kind=no-behavior wave=2 status=merged outlineRef=baseline-violations-fix
  - secrets-triage-spike kind=fact-finder wave=2 status=blocked outlineRef=secrets-triage-spike
  - golden-contract-hardening kind=test-only wave=2 status=merged outlineRef=golden-contract-hardening
  - model-eval-poc kind=poc wave=2 status=merged outlineRef=model-eval-poc
  - cache-design-spike kind=poc wave=3 status=pending outlineRef=cache-design-spike
  - decision-runtime-pinning kind=test-assumptions wave=3 status=pending outlineRef=decision-runtime-pinning
  - coding-rules-audit-i2 kind=fact-finder wave=3 status=pending outlineRef=coding-rules-audit
  - test-debloat-audit-i2 kind=fact-finder wave=4 status=pending outlineRef=test-debloat-audit
waves: 1, 2, 3, 4
merged: runner-format-contract, consolidate-integration-helpers-i2, model-candidate-matrix, baseline-violations-fix, golden-contract-hardening, model-eval-poc
blocked: secrets-triage-spike
failed: (none)
open steer questions:
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-secrets-triage-spike-factory-exclusion-residual-risk ref=secrets-triage-spike disposition=human-awareness: Finding count is HEAD-pinned, not stable: 8 at a7fad649, reviewer re-measured 19 Secret Type lines with exit 123 on the advanced HEAD — growth confirms the spike's dynamic-journal thesis, so M1 acceptance must cite the mechanism plus pinned HEAD, not the number 8. A genuine secret later written into engine journals would not be caught; retain write-time redaction and periodic unfiltered audits per spike section 7.
  - q-secrets-triage-spike-engine-untrack-runtime-journals ref=secrets-triage-spike disposition=human-async: Add .factory/tasks/*/journal.ndjson and .factory/tasks/*/runs/ to .gitignore with git rm --cached, or seed the should_exclude_file filter at init/backfill. Also correct stale claims: infra.yaml:43-51 note that detect-secrets passes, and gates-baseline.yaml:135 [detect-secrets] PASSED [7.7s] captured 2026-11-07T19:11:42Z (predates flagged journal line 81 ts 2026-11-08T02:00:28Z). M1 dev acceptance does not wait on this.
  - q-secrets-triage-spike-operator-secrets-baseline-exclusion ref=secrets-triage-spike disposition=human-async: Insert {"path": "detect_secrets.filters.regex.should_exclude_file", "pattern": ["^\\.factory/"]} into .secrets.baseline filters_used after line 40. Evidence: HEAD a7fad649, journal.ndjson sha256 1894aacd89836a36ea24de00c485db10a5a1a042dcfe5cdf351c07e645b471e3, output.yaml sha256 744664c850a9f535cdba123f3c05622c9bac44e98c0c94413130d6151e63d509, 8/8 line hashes verified, 7/7 hex hits verified as git commits via cat-file, keyword hashed_secret 43e65bf1414867b0fe6ada36116e53fc1521ec7c verified as sha1 of 358-char prose. Reviewer independently replicated: filtered baseline makes full git-ls-files scan exit 0 while planted control secret still exits 1. M1 dev acceptance does not wait on this.`, `Wave 2 merged 3/3 with no regressions and test fail->pass improved. Additive fix only: baseline-violations-fix resolved SIM102/R0914/C0208 (verified at HEAD: combined TypeAlias condition, _run_fix_phase extraction, 14-tool factory predicates), but lint stays red on the W9704 tail that no item owned. Add small M1 tail item remaining-lint-violations-fix (dep: baseline-violations-fix, already merged, so wave-3 schedulable). No other plan changes: cache-design-spike proceeds model-agnostically (schema/encoding/prune/refresh are model-independent; implementation stays gated on the eval no-go escalation); decision-runtime-pinning takes its specified no-go skip path (report-only, no file); secrets-triage-spike awaits human-async and does not block dev acceptance; M4 audits proceed and verify each row against HEAD at audit time so the 2-comment tail cannot stale them.`, `Wave 2 completed. Merged items: baseline-violations-fix, golden-contract-hardening, model-eval-poc`). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "_RuffFormatLintTool(LintTool) in runner/dispatch.py: build_command(config,_path,_exclude)->check mode ['ruff','format','--check','--config',<resolved ruff.toml>,...paths] (default); build_format_command(...)->mutating mode without --check. cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command. runner/_config.py maps 'ruff format'->ruff.toml; _config_flag_for handles it. No if-spec.name in _build_command.",
        "Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13); RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} intentional. Tests import from python_setup_lint.runner. Migration: test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3 assert STATISTICS set; fakes invariants assert EXPECTED set.",
        "Docs contract: every in-scope tool-count site -> 14 by grep `13[ -]?tools?|all_13|== 13` with per-hit disposition: AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit. EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist: MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted 14 keys incl 'ruff format':0 (verify, not rewrite)."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green per-gate\n  Given clean HEAD with empty lint.baseline\n  When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict\n  Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance",
        "Scenario: Lint check-only without --fix\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check",
        "Scenario: Registry single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py sole site, 11 helpers with pinned names/signatures: copy_sample_project(dest_parent: Path)->Path (dest_parent.mkdir(parents=True, exist_ok=True); copytree tests/data/minimal_sample_project -> dest_parent/'project'; returns project path); git_init_and_stage(project: Path)->None (test/test@test + add .); shipped_config_paths()->dict[str,Path]; make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd: Path)->None (Test/test@example.com, -q, no add); write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project: Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py consumes make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged; helper renames per matrix only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] keeps tool order (no sort, synthetic-empty safe); sorting in serialize_write + _diff_keys; caller test_setup_new_and_lint asserts len(findings)!=0 post-collect and retains first-run [CRASH]-absent + SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel; assert_matches_golden Counter-multiset + UPDATE guard (fail under CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]') used by overlay test; read_oracle_rules, assert_oracle_coverage, assert_tool_coverage retained. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once per matrix\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched",
        "Scenario: Integration gate within single limit\n  Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening via caller asserts\n  Given the committed golden\n  When integration runs plus synthetic drift injection plus temp-copy double-collect\n  Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "Eval contract: decide(justification,rule,context)->float P(meaningful) in [0,1]; mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (spike uses current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto: final=heuristic(text) AND (prob>=threshold) (model only flips True->False; heuristic-False never reaches model); replace: final=(prob>=threshold), heuristic deleted. Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric (specific technical justification vs placeholder/deferral/brush-off); per-source + per-stratum breakdown. Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall apply to the heuristic-accepted stratum (overall also reported). Report per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored or explicitly excluded.",
        "Cache contract (spike-chosen): tracked JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; unified entry {justification, rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen?}; key (justification,rule,model) with secrets-clean encoding (no bare hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime assert); refresh command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model.",
        "Pylint/concurrency contract (writer-first): identify writer (checker open/close vs runner post-process) + write timing (per-visit vs end-of-run) + --path scoping across 3 sequential pylint invocations (no -j, no contention); verdict derives crash-safe lock/merge/atomic vs no-lock runner merge vs jobs=1/sidecars-if--j."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Model choice is evidence-based over all candidates\n  Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)\n  When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)\n  Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence",
        "Scenario: Cache deterministic-given-cache+model\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present-miss, and cache-hit\n  Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash",
        "Scenario: Writer and timing pinned before lock design\n  Given pylint 4.x invocation tests\n  When writer + timing + --path scoping are pinned\n  Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Replan input contract: audits emit structured tables in item reports (engine-durable orchestration records: items/*/assignment + wave reports + decisions/, readable at replan per the task status contract); iteration-3 replan consumes reports + re-globs HEAD for validation only (no committed map; fact-finders write nothing; escape hatch = kind change to committed artifact if the engine ever drops reports). Owner enum {runner,checkers,setup-testing,semantic,root}. Ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/** (stubs/conftest/__init__/_factories included; stub follows .py). Root-owned group (epics read-only): tests/data/** (golden, minimal_sample, oracles; golden regen only by root item), config/**, docs/**, repo-root files. Every universe file appears exactly once with exactly one owner; root-owned listed as a group.",
        "File ownership separate from symbol exclusions: ownership is whole-file; skips live in an exclusion column (src: _semantic.py+.pyi, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline). Planned-path reservations (new backend/cache modules, epic conftest/runtime modules) listed separately, not globbed."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried with disjoint ownership\n  Given CodingRules.md and AGENTS.md\n  When the audit completes on final HEAD (M1+M2 merged)\n  Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved",
        "Scenario: Test redundancy inventoried with pinning limbs\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map",
        "Scenario: Replan input is complete and validatable\n  Given both audit reports plus HEAD\n  When the iteration-3 replan re-globs HEAD\n  Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + 90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark exists here; mapping/modes/metric now pinned, corpus deduped + stratified by the spike.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto + replace modes on >=100 deduped corpus with rubric; compliance on heuristic-accepted stratum; smallest compliant model/prompt/threshold+mode or no-go",
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
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured; subsystem epics need the unified map with file-vs-symbol separation, root-owned groups, and planned-path reservations.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of unified map + exclusion column + reservations)",
        "test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning inventory)"
      ]
    },
    {
      "description": "detect-secrets flags on clean checkout are of unknown source: tracked factory runtime journals (environmental) vs a real secret. The exclusion mechanism (engine config vs gate flag) is also unknown, so M1 lint-green cannot be defined for that tool until triaged.",
      "id": "U4",
      "spikeOutlines": [
        "secrets-triage-spike (fact-finder, no repo writes): clean-checkout scan, flagged files + sha256 + verdict environmental-vs-real + exact exclusion mechanism; human-async operator request if environmental"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command -> check mode (--check + --config resolved ruff.toml); build_format_command -> mutating mode; register in _strategy_for; map 'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a calls build_format_command, normal pass calls build_command. No if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES + FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py, re-exported via runner/__init__; migrate the 6 named tests (test_lint_runner set+count; _factories_extras len+id; stats + t3 to STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; _factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit). CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted. Assert tool_counts.json already 14 keys (not rewrite). Verify: format/lint/pytest/integration exit 0; git status --porcelain empty after `uv run lint` (no --fix); spy asserts normal-pass cmd has --check + --config with resolved existing path (composed temp accepted) and phase-1a omits --check (fix-only); golden byte-identical; baseline [].",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 60,
      "slug": "runner-format-contract",
      "title": "Ruff format strategy and 14-tool registry fix"
    },
    {
      "deps": [
        "runner-format-contract"
      ],
      "description": "Serialized after runner-format-contract (shared cli.py ownership; applies onto the phase-1a call-site shape). Behavior-preserving refactors, baseline stays []: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif TypeAlias + nested if AssignName) -> single combined condition. (2) cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). (3) tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). Verify: lint gate reports zero violations in src/** and tests/**; pytest + integration show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 35,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102, too-many-locals, C0208"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. On clean checkout run the declared lint gate / detect-secrets scan; capture every flagged file + sha256 + baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify the exact exclusion mechanism (engine config vs gate command flag) + evidence hashes, and record the operator/engine exclusion request as human-async (M1 dev acceptance does not wait on it). If real: specify redact/rotate follow-up. Output feeds M1 acceptance + U4.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-triage-spike",
      "title": "Triage detect-secrets factory-journal flags"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md, docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir parents, copytree tests/data/minimal_sample_project -> dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex _shipped_config_paths]; make_runner_config(project)->RunnerConfig [minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex _write_file]; stage_file(cwd,rel)->None [ex _stage]; commit_all(cwd,msg)->None [ex _commit_all]; build_pylint_overlay_config(project,disable_rule)->Path [extract overlay 217-240]; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py uses make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged. Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202 stale too-many-locals disable directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
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
      "description": "Tests-only hardening, committed files never mutated by proofs. No __CRASH__ sentinel and no sort-in-collect: keep collect tool-order; sorting stays in serialize_write + _diff_keys; add caller asserts in test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH] absent + SKIPPED only package_name retained); keep Counter-multiset diff + UPDATE guard + oracle/tool coverage; use slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test; extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via temp-copy double-collect: collect+serialize on two fresh temp copies, sha256 hashes equal each other and equal committed golden hash. UPDATE_GOLDEN=1 never touches committed files except reviewed regen. Verify: integration + test_golden pass; golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden via caller asserts and shared slicer"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license, params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output feeds eval-poc (all candidates) + cache spike (model-id/rev format) + runtime pinning.",
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
      "description": "No committed code; report only (temp venv/copy permitted, network inside spike only). Mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto final=heuristic AND (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric: specific technical justification vs placeholder/deferral/brush-off; per-source + per-stratum breakdown. Score ALL matrix candidates at 0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy, meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall) apply to the heuristic-accepted stratum (overall also reported). Recommend smallest compliant model+prompt+threshold+mode, or no-go with evidence.",
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
        "baseline-violations-fix",
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "runner-format-contract"
      ],
      "description": "Read-only; zero repo writes. Audit src/** + scripts/** vs CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item report (engine-durable replan input): rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint file-ownership map over the ownership universe (src+scripts+tests minus tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub follows .py; tests/data + config + docs as root-owned group) + symbol-exclusion column (_base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations (new backend/cache modules). Single owner of the map; test audit aligns via inter-dep. Reads final HEAD + beartype report + secrets-spike verdict.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "coding-rules-audit",
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit tests/** (minus tests/data, root-owned). Output in item report: rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag) + symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) + planned-path reservations (epic conftest/runtime modules). Owner column aligned to coding audit's unified map via inter-dep (file ownership separate from symbol skips). Iteration-3 replan consumes both reports + HEAD re-glob validation.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    },
    {
      "deps": [
        "baseline-violations-fix"
      ],
      "description": "Close the M1 green-baseline tail: wave-2 report lists lint still red, and the two W9704 sites from infra notes (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore site) were never owned by any item (TD2-B2 omitted them). Steps: (1) Reproduce current failures via the declared gates (format check + 13-tool lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations. (2) Fix with justification-comment-only edits (no behavior change; red-test-exempt like baseline-violations-fix): strengthen trailing justifications so the justification checker accepts. If additional violations appear, fix only if trivially behavior-preserving, else record as debt in the report — do not balloon scope. FORBIDDEN: lint.baseline edits (stays []), tests/data/** changes, golden regen, unrelated refactors, .secrets.baseline, factory records. Secrets-triage verdict is human-async and out of scope. Verify: lint gate zero violations in src/** and tests/**; `pytest -q` + integration show no new failures; golden byte-identical; touched files format-clean.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 5,
      "slug": "remaining-lint-violations-fix",
      "title": "Fix remaining src/tests lint violations (W9704 tail)"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material. Model may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only today) by design; SEMANTIC=1 golden will shift with shift report + CHANGELOG + root regen.",
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
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for approval; if no candidate meets license + CPU + py3.14 + bars, the epic escalates.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial licensing by default; operator must see the gating criterion before the eval verdict."
    },
    {
      "assumption": "Gate contracts (paths/commands) do not change: tests/integration.py, `pytest -q`, integration, split format/lint gates until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1 mutation hazard) or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates pre-M1; split gates are the check-only workaround."
    },
    {
      "assumption": "Semantic epic record spawns in iteration 2; its implementation runs in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes report without replanning.",
      "why": "Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and pins the spawn wave."
    },
    {
      "assumption": "Factory-journal detect-secrets hits are triaged by secrets-triage-spike (environmental vs real with hash evidence). M1 dev acceptance is zero violations in src/** and tests/**; any factory-journal exclusion is operator/engine action tracked as human-async and never blocks dev items.",
      "disposition": "verify via secrets-triage-spike",
      "why": "Isolates the environmental unknown from dev stories per uncertainty containment; M1 green must not depend on out-of-band operator action."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker with a CPU-friendly small decision model + git-stored self-cleaning cache. Child epic of `modernize`. Record spawns iteration 2; implementation runs iteration 3 consuming spikes (candidate matrix, CPU eval, cache design, pylint semantics, runtime pinning).\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi + new private backend/cache modules (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache tests, tests/checkers/conftest.py, runtime modules under tests/assumptions/. Protocol: NEVER write tests/data/** (read golden for verification; on heuristic shift emit shift report + CHANGELOG description, root regenerates). AGENTS.md pipeline section ONLY (Semantic justification pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1 owns all count lines); never touch count lines (:9,43,63,92,93) or counts table (:10-11). tests/assumptions append-only. No edits to tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.\n\n## Requirements\n1. Implement spike verdict: chosen model id/revision, noul prompt + criteria, threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall on the heuristic-accepted stratum, in the recommended mode (veto vs replace), or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial; Fastino needs human approval.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None. Public DecisionBackend Protocol decide(justification,rule,context)->float with spike-pinned mapping (justification=primary, rule=joined codes, context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra/failure: heuristic + cache hits, one warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model) with spike-chosen secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh writes via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation. Sweep scoped to linted files; drop empty-files + stale-model. Must pass all tools incl. detect-secrets. Concurrency per writer-first verdict.\n5. Real suppressed codes: extract all codes, normalize/sort/join ',' as rule (bare-except keeps single symbol). Rule-echo rejects on any element. On shift: shift report + CHANGELOG, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one deduped parametrized table; FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` + ImportError-propagation test; modules <=500, no suppressions; never test linting.\n7. Docs: Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches model; one call per unique pair; scoped cleanup; no retry storm. Format/lint/pytest/integration green with empty baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass indistinguishable at _fix=False.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: _RuffFormatLintTool with check vs format modes, phase-1a mutates (fix-only), normal pass checks with shipped config, registry single-sourced."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102 src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50 (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool migration + docs enumeration with grep disposition) + baseline-violations-fix serialized after it (SIM102 + locals split + C0208 sequence fix). Baseline stays []."
    },
    {
      "category": "blocking",
      "description": "detect-secrets flags factory-journal files on clean checkout; environmental vs real unverified, so M1 lint-green is undefined for that tool.",
      "id": "TD2-B3",
      "resolution": "Owned by secrets-triage-spike (fact-finder, report with file hashes + verdict + exclusion mechanism). Environmental -> operator/engine exclusion as human-async (M1 dev acceptance does not wait); real -> redact/rotate follow-up. M1 dev acceptance is zero violations in src/** and tests/**."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines (:12) + stale too-many-locals (:202, globally disabled in .pylintrc-tests:39) suppressions; helpers duplicated across integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs mkdir-parents.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, 11-helper matrix incl mkdir-parents copy, conftest def deleted with 2 import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction + :202 stale deleted directly, golden byte-identical)."
    },
    {
      "category": "impacting",
      "description": "Golden drift: tool-order vs sort placement, len!=0/crash asserts unplaced, unused slice_tool_section with unpinned markers, regen-twice would mutate committed files.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening: tool-order collect, serialize/diff sorting, caller len/crash asserts, no sentinel, slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy double-collect determinism proof, UPDATE_GOLDEN never touches committed files except reviewed regen."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts + ImportError-propagation test; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic iteration-3 implementation (FakeBackend injection, deduped merged table, modules <=500, vacuous tests deleted)."
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
      "consequences": "`uv run lint` without --fix is check-only (not hermetic: subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split format/lint gates reunify after merge. 14-tool docs/tests stabilize on one registry with historical CHANGELOG preserved.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config (default 88 vs shipped 130), dirtying ~109 files; phase-1a (mutate) and normal pass (check) both call build_command with _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS; _compose_ruff_config may return a temp path so spies must not match literals.",
      "decision": "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy pattern: build_command emits check mode (ruff format --check --config <resolved ruff.toml>) by default; build_format_command emits mutating mode. cli.py phase-1a calls build_format_command, normal pass calls build_command. Map 'ruff format'->ruff.toml in runner/_config.py + _config_flag_for. Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} documented intentional. Tests import from python_setup_lint.runner. Tool-count migration verified by grep with per-hit disposition, CHANGELOG historical exclusion, and MD013/130 allowlist.",
      "id": "ADR-005",
      "title": "Ruff format strategy with explicit check vs format modes"
    },
    {
      "consequences": "Golden stays byte-identical; crash/empty sensitivity explicit in caller; overlay uses shared slicer; no invented sentinel; committed files never mutated by determinism proofs.",
      "context": "Merged collect_findings runs a second pipeline on the private record-parser subset (avoids formatter pollution and baseline capture). It returns tool-order, sorts only in serialize, and no code emits __CRASH__ (crashes surface as [CRASH] text; parsers return [] on garbage). UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target them.",
      "decision": "Ratify private-subset second run as intentional. No Finding-level __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order (synthetic-empty safe); sorting lives in serialize_write + _diff_keys. len(findings)!=0 asserted by the caller after collect. slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen.",
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
      "consequences": "One replan point (M4) consumes durable report tables + HEAD validation; subsystem epics spawn in iteration 3 with disjoint ownership; semantic implementation follows spike verdicts. No concurrent shared-infra edits. No committed map to maintain; audits stay zero-write.",
      "context": "Remaining scope spans runner/checkers/setup plus semantic swap. Audits must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel with one replan gate. Review questioned whether item-report tables are durable enough to feed iteration-3 replan.",
      "decision": "Iteration 2: green baseline, infra completion, spikes, audits. Semantic epic record spawns now; its implementation is scheduled iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from the unified map. ARCHITECT DECISION on durability: item reports persist as engine-durable orchestration records (items/*/assignment + wave reports + decisions/), readable at replan per the task status contract; validation re-globs HEAD. No committed map; fact-finders stay zero-repo-write. Escape hatch (not default): if the engine ever drops reports, replan re-runs the audit queries or the kind changes to a committed artifact.",
      "id": "ADR-008",
      "title": "Single-replan progressive decomposition with report-fed replan"
    }
  ]
}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Wave ordering stays strict (deps only on earlier waves).
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

## Current Plan
{
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "_RuffFormatLintTool(LintTool) in runner/dispatch.py: build_command(config,_path,_exclude)->check mode ['ruff','format','--check','--config',<resolved ruff.toml>,...paths] (default); build_format_command(...)->mutating mode without --check. cli.py phase-1a calls build_format_command (fix-only), normal pass calls build_command. runner/_config.py maps 'ruff format'->ruff.toml; _config_flag_for handles it. No if-spec.name in _build_command.",
        "Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13); RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} intentional. Tests import from python_setup_lint.runner. Migration: test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3 assert STATISTICS set; fakes invariants assert EXPECTED set.",
        "Docs contract: every in-scope tool-count site -> 14 by grep `13[ -]?tools?|all_13|== 13` with per-hit disposition: AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit. EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist: MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted 14 keys incl 'ruff format':0 (verify, not rewrite)."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green per-gate\n  Given clean HEAD with empty lint.baseline\n  When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict\n  Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance",
        "Scenario: Lint check-only without --fix\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check",
        "Scenario: Registry single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py sole site, 11 helpers with pinned names/signatures: copy_sample_project(dest_parent: Path)->Path (dest_parent.mkdir(parents=True, exist_ok=True); copytree tests/data/minimal_sample_project -> dest_parent/'project'; returns project path); git_init_and_stage(project: Path)->None (test/test@test + add .); shipped_config_paths()->dict[str,Path]; make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd: Path)->None (Test/test@example.com, -q, no add); write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project: Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py consumes make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged; helper renames per matrix only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] keeps tool order (no sort, synthetic-empty safe); sorting in serialize_write + _diff_keys; caller test_setup_new_and_lint asserts len(findings)!=0 post-collect and retains first-run [CRASH]-absent + SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel; assert_matches_golden Counter-multiset + UPDATE guard (fail under CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]') used by overlay test; read_oracle_rules, assert_oracle_coverage, assert_tool_coverage retained. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once per matrix\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched",
        "Scenario: Integration gate within single limit\n  Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening via caller asserts\n  Given the committed golden\n  When integration runs plus synthetic drift injection plus temp-copy double-collect\n  Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "Eval contract: decide(justification,rule,context)->float P(meaningful) in [0,1]; mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (spike uses current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto: final=heuristic(text) AND (prob>=threshold) (model only flips True->False; heuristic-False never reaches model); replace: final=(prob>=threshold), heuristic deleted. Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric (specific technical justification vs placeholder/deferral/brush-off); per-source + per-stratum breakdown. Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall apply to the heuristic-accepted stratum (overall also reported). Report per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored or explicitly excluded.",
        "Cache contract (spike-chosen): tracked JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; unified entry {justification, rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen?}; key (justification,rule,model) with secrets-clean encoding (no bare hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime assert); refresh command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model.",
        "Pylint/concurrency contract (writer-first): identify writer (checker open/close vs runner post-process) + write timing (per-visit vs end-of-run) + --path scoping across 3 sequential pylint invocations (no -j, no contention); verdict derives crash-safe lock/merge/atomic vs no-lock runner merge vs jobs=1/sidecars-if--j."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Model choice is evidence-based over all candidates\n  Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)\n  When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)\n  Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence",
        "Scenario: Cache deterministic-given-cache+model\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present-miss, and cache-hit\n  Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash",
        "Scenario: Writer and timing pinned before lock design\n  Given pylint 4.x invocation tests\n  When writer + timing + --path scoping are pinned\n  Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Replan input contract: audits emit structured tables in item reports (engine-durable orchestration records: items/*/assignment + wave reports + decisions/, readable at replan per the task status contract); iteration-3 replan consumes reports + re-globs HEAD for validation only (no committed map; fact-finders write nothing; escape hatch = kind change to committed artifact if the engine ever drops reports). Owner enum {runner,checkers,setup-testing,semantic,root}. Ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/** (stubs/conftest/__init__/_factories included; stub follows .py). Root-owned group (epics read-only): tests/data/** (golden, minimal_sample, oracles; golden regen only by root item), config/**, docs/**, repo-root files. Every universe file appears exactly once with exactly one owner; root-owned listed as a group.",
        "File ownership separate from symbol exclusions: ownership is whole-file; skips live in an exclusion column (src: _semantic.py+.pyi, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline). Planned-path reservations (new backend/cache modules, epic conftest/runtime modules) listed separately, not globbed."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried with disjoint ownership\n  Given CodingRules.md and AGENTS.md\n  When the audit completes on final HEAD (M1+M2 merged)\n  Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved",
        "Scenario: Test redundancy inventoried with pinning limbs\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map",
        "Scenario: Replan input is complete and validatable\n  Given both audit reports plus HEAD\n  When the iteration-3 replan re-globs HEAD\n  Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + 90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark exists here; mapping/modes/metric now pinned, corpus deduped + stratified by the spike.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto + replace modes on >=100 deduped corpus with rubric; compliance on heuristic-accepted stratum; smallest compliant model/prompt/threshold+mode or no-go",
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
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured; subsystem epics need the unified map with file-vs-symbol separation, root-owned groups, and planned-path reservations.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of unified map + exclusion column + reservations)",
        "test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning inventory)"
      ]
    },
    {
      "description": "detect-secrets flags on clean checkout are of unknown source: tracked factory runtime journals (environmental) vs a real secret. The exclusion mechanism (engine config vs gate flag) is also unknown, so M1 lint-green cannot be defined for that tool until triaged.",
      "id": "U4",
      "spikeOutlines": [
        "secrets-triage-spike (fact-finder, no repo writes): clean-checkout scan, flagged files + sha256 + verdict environmental-vs-real + exact exclusion mechanism; human-async operator request if environmental"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py: build_command -> check mode (--check + --config resolved ruff.toml); build_format_command -> mutating mode; register in _strategy_for; map 'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a calls build_format_command, normal pass calls build_command. No if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES + FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py, re-exported via runner/__init__; migrate the 6 named tests (test_lint_runner set+count; _factories_extras len+id; stats + t3 to STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58; docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155; runner/__init__.py:3; cli.py:314; _factories.py:46; _factories_extras.py:1,377-378; test_lint_runner.py:50,76; test_extra_tools.py:237; test_self_lint_clean.py:3; test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24; test_testing_fakes.py:137,165; plus any further tool-count grep hit). CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted. Assert tool_counts.json already 14 keys (not rewrite). Verify: format/lint/pytest/integration exit 0; git status --porcelain empty after `uv run lint` (no --fix); spy asserts normal-pass cmd has --check + --config with resolved existing path (composed temp accepted) and phase-1a omits --check (fix-only); golden byte-identical; baseline [].",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 60,
      "slug": "runner-format-contract",
      "title": "Ruff format strategy and 14-tool registry fix"
    },
    {
      "deps": [
        "runner-format-contract"
      ],
      "description": "Serialized after runner-format-contract (shared cli.py ownership; applies onto the phase-1a call-site shape). Behavior-preserving refactors, baseline stays []: (1) src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif TypeAlias + nested if AssignName) -> single combined condition. (2) cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). (3) tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence type. Secrets explicitly OUT of scope (owned by secrets-triage-spike). Verify: lint gate reports zero violations in src/** and tests/**; pytest + integration show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 35,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102, too-many-locals, C0208"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. On clean checkout run the declared lint gate / detect-secrets scan; capture every flagged file + sha256 + baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify the exact exclusion mechanism (engine config vs gate command flag) + evidence hashes, and record the operator/engine exclusion request as human-async (M1 dev acceptance does not wait on it). If real: specify redact/rotate follow-up. Output feeds M1 acceptance + U4.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-triage-spike",
      "title": "Triage detect-secrets factory-journal flags"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md, docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir parents, copytree tests/data/minimal_sample_project -> dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex _shipped_config_paths]; make_runner_config(project)->RunnerConfig [minimal_sample + rumdl override idempotent, no-op if shipped rumdl missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex _write_file]; stage_file(cwd,rel)->None [ex _stage]; commit_all(cwd,msg)->None [ex _commit_all]; build_pylint_overlay_config(project,disable_rule)->Path [extract overlay 217-240]; ensure_precommit_or_skip()->None; install_twice_assert_idempotent(project,monkeypatch)->None. STAY in _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd, _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete shipped_config_paths def entirely (no re-export); rewrite test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from tests._project_helpers import ...`; integration.py uses make_runner_config + mapped subset. Cycle guard: _project_helpers imports stdlib + python_setup_lint.runner/setup/testing only, never tests.conftest/tests.integration. Test class/function names unchanged. Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202 stale too-many-locals disable directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
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
      "description": "Tests-only hardening, committed files never mutated by proofs. No __CRASH__ sentinel and no sort-in-collect: keep collect tool-order; sorting stays in serialize_write + _diff_keys; add caller asserts in test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH] absent + SKIPPED only package_name retained); keep Counter-multiset diff + UPDATE guard + oracle/tool coverage; use slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test; extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via temp-copy double-collect: collect+serialize on two fresh temp copies, sha256 hashes equal each other and equal committed golden hash. UPDATE_GOLDEN=1 never touches committed files except reviewed regen. Verify: integration + test_golden pass; golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden via caller asserts and shared slicer"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license, params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output feeds eval-poc (all candidates) + cache spike (model-id/rev format) + runtime pinning.",
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
      "description": "No committed code; report only (temp venv/copy permitted, network inside spike only). Mapping: justification=primary=(comment or text).strip(), rule=joined suppressed codes (current rule symbol where codes unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold. Modes: veto final=heuristic AND (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo suppressions, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric: specific technical justification vs placeholder/deferral/brush-off; per-source + per-stratum breakdown. Score ALL matrix candidates at 0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy, meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall) apply to the heuristic-accepted stratum (overall also reported). Recommend smallest compliant model+prompt+threshold+mode, or no-go with evidence.",
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
        "baseline-violations-fix",
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "runner-format-contract"
      ],
      "description": "Read-only; zero repo writes. Audit src/** + scripts/** vs CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item report (engine-durable replan input): rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint file-ownership map over the ownership universe (src+scripts+tests minus tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub follows .py; tests/data + config + docs as root-owned group) + symbol-exclusion column (_base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations (new backend/cache modules). Single owner of the map; test audit aligns via inter-dep. Reads final HEAD + beartype report + secrets-spike verdict.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "coding-rules-audit",
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit tests/** (minus tests/data, root-owned). Output in item report: rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag) + symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) + planned-path reservations (epic conftest/runtime modules). Owner column aligned to coding audit's unified map via inter-dep (file ownership separate from symbol skips). Iteration-3 replan consumes both reports + HEAD re-glob validation.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    },
    {
      "deps": [
        "baseline-violations-fix"
      ],
      "description": "Close the M1 green-baseline tail: wave-2 report lists lint still red, and the two W9704 sites from infra notes (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore site) were never owned by any item (TD2-B2 omitted them). Steps: (1) Reproduce current failures via the declared gates (format check + 13-tool lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations. (2) Fix with justification-comment-only edits (no behavior change; red-test-exempt like baseline-violations-fix): strengthen trailing justifications so the justification checker accepts. If additional violations appear, fix only if trivially behavior-preserving, else record as debt in the report — do not balloon scope. FORBIDDEN: lint.baseline edits (stays []), tests/data/** changes, golden regen, unrelated refactors, .secrets.baseline, factory records. Secrets-triage verdict is human-async and out of scope. Verify: lint gate zero violations in src/** and tests/**; `pytest -q` + integration show no new failures; golden byte-identical; touched files format-clean.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 5,
      "slug": "remaining-lint-violations-fix",
      "title": "Fix remaining src/tests lint violations (W9704 tail)"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material. Model may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only today) by design; SEMANTIC=1 golden will shift with shift report + CHANGELOG + root regen.",
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
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for approval; if no candidate meets license + CPU + py3.14 + bars, the epic escalates.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial licensing by default; operator must see the gating criterion before the eval verdict."
    },
    {
      "assumption": "Gate contracts (paths/commands) do not change: tests/integration.py, `pytest -q`, integration, split format/lint gates until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1 mutation hazard) or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates pre-M1; split gates are the check-only workaround."
    },
    {
      "assumption": "Semantic epic record spawns in iteration 2; its implementation runs in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes report without replanning.",
      "why": "Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and pins the spawn wave."
    },
    {
      "assumption": "Factory-journal detect-secrets hits are triaged by secrets-triage-spike (environmental vs real with hash evidence). M1 dev acceptance is zero violations in src/** and tests/**; any factory-journal exclusion is operator/engine action tracked as human-async and never blocks dev items.",
      "disposition": "verify via secrets-triage-spike",
      "why": "Isolates the environmental unknown from dev stories per uncertainty containment; M1 green must not depend on out-of-band operator action."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker with a CPU-friendly small decision model + git-stored self-cleaning cache. Child epic of `modernize`. Record spawns iteration 2; implementation runs iteration 3 consuming spikes (candidate matrix, CPU eval, cache design, pylint semantics, runtime pinning).\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi + new private backend/cache modules (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache tests, tests/checkers/conftest.py, runtime modules under tests/assumptions/. Protocol: NEVER write tests/data/** (read golden for verification; on heuristic shift emit shift report + CHANGELOG description, root regenerates). AGENTS.md pipeline section ONLY (Semantic justification pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1 owns all count lines); never touch count lines (:9,43,63,92,93) or counts table (:10-11). tests/assumptions append-only. No edits to tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.\n\n## Requirements\n1. Implement spike verdict: chosen model id/revision, noul prompt + criteria, threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall on the heuristic-accepted stratum, in the recommended mode (veto vs replace), or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial; Fastino needs human approval.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None. Public DecisionBackend Protocol decide(justification,rule,context)->float with spike-pinned mapping (justification=primary, rule=joined codes, context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra/failure: heuristic + cache hits, one warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model) with spike-chosen secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh writes via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation. Sweep scoped to linted files; drop empty-files + stale-model. Must pass all tools incl. detect-secrets. Concurrency per writer-first verdict.\n5. Real suppressed codes: extract all codes, normalize/sort/join ',' as rule (bare-except keeps single symbol). Rule-echo rejects on any element. On shift: shift report + CHANGELOG, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one deduped parametrized table; FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` + ImportError-propagation test; modules <=500, no suppressions; never test linting.\n7. Docs: Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches model; one call per unique pair; scoped cleanup; no retry storm. Format/lint/pytest/integration green with empty baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass indistinguishable at _fix=False.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: _RuffFormatLintTool with check vs format modes, phase-1a mutates (fix-only), normal pass checks with shipped config, registry single-sourced."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102 src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50 (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool migration + docs enumeration with grep disposition) + baseline-violations-fix serialized after it (SIM102 + locals split + C0208 sequence fix). Baseline stays []."
    },
    {
      "category": "blocking",
      "description": "detect-secrets flags factory-journal files on clean checkout; environmental vs real unverified, so M1 lint-green is undefined for that tool.",
      "id": "TD2-B3",
      "resolution": "Owned by secrets-triage-spike (fact-finder, report with file hashes + verdict + exclusion mechanism). Environmental -> operator/engine exclusion as human-async (M1 dev acceptance does not wait); real -> redact/rotate follow-up. M1 dev acceptance is zero violations in src/** and tests/**."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines (:12) + stale too-many-locals (:202, globally disabled in .pylintrc-tests:39) suppressions; helpers duplicated across integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs mkdir-parents.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, 11-helper matrix incl mkdir-parents copy, conftest def deleted with 2 import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction + :202 stale deleted directly, golden byte-identical)."
    },
    {
      "category": "impacting",
      "description": "Golden drift: tool-order vs sort placement, len!=0/crash asserts unplaced, unused slice_tool_section with unpinned markers, regen-twice would mutate committed files.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening: tool-order collect, serialize/diff sorting, caller len/crash asserts, no sentinel, slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy double-collect determinism proof, UPDATE_GOLDEN never touches committed files except reviewed regen."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts + ImportError-propagation test; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic iteration-3 implementation (FakeBackend injection, deduped merged table, modules <=500, vacuous tests deleted)."
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
      "consequences": "`uv run lint` without --fix is check-only (not hermetic: subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split format/lint gates reunify after merge. 14-tool docs/tests stabilize on one registry with historical CHANGELOG preserved.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config (default 88 vs shipped 130), dirtying ~109 files; phase-1a (mutate) and normal pass (check) both call build_command with _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS; _compose_ruff_config may return a temp path so spies must not match literals.",
      "decision": "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy pattern: build_command emits check mode (ruff format --check --config <resolved ruff.toml>) by default; build_format_command emits mutating mode. cli.py phase-1a calls build_format_command, normal pass calls build_command. Map 'ruff format'->ruff.toml in runner/_config.py + _config_flag_for. Registry invariants owned by runner/dispatch.py, re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14), FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13), RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach check,mypy.stubtest,pyright verify types,detect-secrets,ruff format} documented intentional. Tests import from python_setup_lint.runner. Tool-count migration verified by grep with per-hit disposition, CHANGELOG historical exclusion, and MD013/130 allowlist.",
      "id": "ADR-005",
      "title": "Ruff format strategy with explicit check vs format modes"
    },
    {
      "consequences": "Golden stays byte-identical; crash/empty sensitivity explicit in caller; overlay uses shared slicer; no invented sentinel; committed files never mutated by determinism proofs.",
      "context": "Merged collect_findings runs a second pipeline on the private record-parser subset (avoids formatter pollution and baseline capture). It returns tool-order, sorts only in serialize, and no code emits __CRASH__ (crashes surface as [CRASH] text; parsers return [] on garbage). UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target them.",
      "decision": "Ratify private-subset second run as intentional. No Finding-level __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order (synthetic-empty safe); sorting lives in serialize_write + _diff_keys. len(findings)!=0 asserted by the caller after collect. slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test. Determinism proven by temp-copy double-collect (two fresh temp copies, sha256 of serialized findings equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never touches committed files except reviewed regen.",
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
      "consequences": "One replan point (M4) consumes durable report tables + HEAD validation; subsystem epics spawn in iteration 3 with disjoint ownership; semantic implementation follows spike verdicts. No concurrent shared-infra edits. No committed map to maintain; audits stay zero-write.",
      "context": "Remaining scope spans runner/checkers/setup plus semantic swap. Audits must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel with one replan gate. Review questioned whether item-report tables are durable enough to feed iteration-3 replan.",
      "decision": "Iteration 2: green baseline, infra completion, spikes, audits. Semantic epic record spawns now; its implementation is scheduled iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at the iteration-3 replan from the unified map. ARCHITECT DECISION on durability: item reports persist as engine-durable orchestration records (items/*/assignment + wave reports + decisions/), readable at replan per the task status contract; validation re-globs HEAD. No committed map; fact-finders stay zero-repo-write. Escape hatch (not default): if the engine ever drops reports, replan re-runs the audit queries or the kind changes to a committed artifact.",
      "id": "ADR-008",
      "title": "Single-replan progressive decomposition with report-fed replan"
    }
  ]
}

## Task Status
iteration: 2
amendments: 1
items:
  - runner-format-contract kind=dev wave=1 status=merged outlineRef=runner-format-contract
  - consolidate-integration-helpers-i2 kind=test-only wave=1 status=merged outlineRef=consolidate-integration-helpers
  - model-candidate-matrix kind=fact-finder wave=1 status=merged outlineRef=model-candidate-matrix
  - pylint-cache-assumptions kind=test-assumptions wave=1 status=running outlineRef=pylint-cache-assumptions
  - baseline-violations-fix kind=no-behavior wave=2 status=merged outlineRef=baseline-violations-fix
  - secrets-triage-spike kind=fact-finder wave=2 status=blocked outlineRef=secrets-triage-spike
  - golden-contract-hardening kind=test-only wave=2 status=merged outlineRef=golden-contract-hardening
  - model-eval-poc kind=poc wave=2 status=merged outlineRef=model-eval-poc
  - cache-design-spike kind=poc wave=3 status=pending outlineRef=cache-design-spike
  - decision-runtime-pinning kind=test-assumptions wave=3 status=pending outlineRef=decision-runtime-pinning
  - coding-rules-audit-i2 kind=fact-finder wave=3 status=pending outlineRef=coding-rules-audit
  - test-debloat-audit-i2 kind=fact-finder wave=4 status=pending outlineRef=test-debloat-audit
waves: 1, 2, 3, 4
merged: runner-format-contract, consolidate-integration-helpers-i2, model-candidate-matrix, baseline-violations-fix, golden-contract-hardening, model-eval-poc
blocked: secrets-triage-spike
failed: (none)
open steer questions:
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-secrets-triage-spike-factory-exclusion-residual-risk ref=secrets-triage-spike disposition=human-awareness: Finding count is HEAD-pinned, not stable: 8 at a7fad649, reviewer re-measured 19 Secret Type lines with exit 123 on the advanced HEAD — growth confirms the spike's dynamic-journal thesis, so M1 acceptance must cite the mechanism plus pinned HEAD, not the number 8. A genuine secret later written into engine journals would not be caught; retain write-time redaction and periodic unfiltered audits per spike section 7.
  - q-secrets-triage-spike-engine-untrack-runtime-journals ref=secrets-triage-spike disposition=human-async: Add .factory/tasks/*/journal.ndjson and .factory/tasks/*/runs/ to .gitignore with git rm --cached, or seed the should_exclude_file filter at init/backfill. Also correct stale claims: infra.yaml:43-51 note that detect-secrets passes, and gates-baseline.yaml:135 [detect-secrets] PASSED [7.7s] captured 2026-11-07T19:11:42Z (predates flagged journal line 81 ts 2026-11-08T02:00:28Z). M1 dev acceptance does not wait on this.
  - q-secrets-triage-spike-operator-secrets-baseline-exclusion ref=secrets-triage-spike disposition=human-async: Insert {"path": "detect_secrets.filters.regex.should_exclude_file", "pattern": ["^\\.factory/"]} into .secrets.baseline filters_used after line 40. Evidence: HEAD a7fad649, journal.ndjson sha256 1894aacd89836a36ea24de00c485db10a5a1a042dcfe5cdf351c07e645b471e3, output.yaml sha256 744664c850a9f535cdba123f3c05622c9bac44e98c0c94413130d6151e63d509, 8/8 line hashes verified, 7/7 hex hits verified as git commits via cat-file, keyword hashed_secret 43e65bf1414867b0fe6ada36116e53fc1521ec7c verified as sha1 of 358-char prose. Reviewer independently replicated: filtered baseline makes full git-ls-files scan exit 0 while planted control secret still exits 1. M1 dev acceptance does not wait on this.

## Architect Amendment Directives
Wave 2 merged 3/3 with no regressions and test fail->pass improved. Additive fix only: baseline-violations-fix resolved SIM102/R0914/C0208 (verified at HEAD: combined TypeAlias condition, _run_fix_phase extraction, 14-tool factory predicates), but lint stays red on the W9704 tail that no item owned. Add small M1 tail item remaining-lint-violations-fix (dep: baseline-violations-fix, already merged, so wave-3 schedulable). No other plan changes: cache-design-spike proceeds model-agnostically (schema/encoding/prune/refresh are model-independent; implementation stays gated on the eval no-go escalation); decision-runtime-pinning takes its specified no-go skip path (report-only, no file); secrets-triage-spike awaits human-async and does not block dev acceptance; M4 audits proceed and verify each row against HEAD at audit time so the 2-comment tail cannot stale them.

## Completed Wave Reports
Wave 2 completed. Merged items: baseline-violations-fix, golden-contract-hardening, model-eval-poc

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
