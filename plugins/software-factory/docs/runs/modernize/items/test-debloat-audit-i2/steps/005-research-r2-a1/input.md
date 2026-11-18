# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.

## Assignment
{
  "slug": "test-debloat-audit-i2",
  "kind": "fact-finder",
  "title": "Inventory redundant tests and pinning limbs",
  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
  "outlineRef": "test-debloat-audit",
  "milestone": "M4",
  "wave": 4,
  "deps": [
    "coding-rules-audit-i2",
    "consolidate-integration-helpers-i2",
    "golden-contract-hardening"
  ],
  "scenarioRefs": [
    "M4-2",
    "M4-3"
  ],
  "citations": [
    "CodingRules.md:230-306",
    "CodingRules.md:139-159",
    "AGENTS.md:87-93",
    "pyproject.toml:49-49",
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_threshold.py:19-25"
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


## Context & Citations
[
  "CodingRules.md:230-306",
  "CodingRules.md:139-159",
  "AGENTS.md:87-93",
  "pyproject.toml:49-49",
  "tests/checkers/test_semantic_check.py:1-7",
  "tests/checkers/test_semantic_threshold.py:19-25"
]

## Review Feedback
Retry granted. Rewrite the report (report-only, zero repo writes) fixing all 10 in this order: (1) Owners: restore the unified-map 5-owner scheme exactly (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15) from coding-rules-audit-i2 output.yaml:82-88; delete the 10 invented tokens; test_suppression file stays checkers-file with TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. (2) N|S counts: re-derive EVERY row from per-file `pytest --collect-only` truth (default|slow), never def counts; fix the ~25 listed files (e.g. semantic-check 82|3, threshold 80, lint-runner 58, stats 87). (3) Pinning: restore all ~15 blocking-debt limbs from r1 (cli --force-fix+env, --format, --cwd, --config-status; 11-label vs 7-label config gap; mypy/rumdl/ty _config_flag_for branches; dispatch scopes ty-src/pylint-pyi-src/pylint-tests-tests/tach-whole-repo; pyright tests/** and rumdl tests/data exclusions) — grep-verify each has zero pins. (4) Self-lint removals: list all six groups (noise-filter, TestModuleSizeGates, private-imports AST scan, autofix-conflict slow, downstream-integration home-write, t9_7 hardcoded checkout) with surviving gates. (5) Reservations: restore epic verbatim (tests/checkers/conftest.py, tests/assumptions runtime/decision/cache, _decision_backend/_decision_cache); delete invented runner/runtime paths; tests/conftest.py is root-owned. (6) Symbols: restore _base.py:143-238 check_if_meaningful (+pyi) and no_try_import _OPTIONAL_IMPORT_PATTERNS exclusions. (7) Duplicates: restore duplicate-of for _make_tc x13, _walk_and_release x10, _msg_ids x8, t3-vs-stats parser-completeness exact dup, autofix fake-vs-git, setup 6x install, _UvCallRecorder x2 — or explicitly justify each drop. (8) Keep test_real_pipeline_smoke.py (sole default full-pipeline pin; integration.py is explicit-only) or name a default-collected survivor. (9) Slow budget: recompute from truth (baseline-edge 16|2 both in TestPerfBenchmark, suppression 40|2) — 18->13 not 14. (10) Runtime: restore integration 65-107s with conditions (WSL2/py3.14.4/warm-cache ±30%). Verify: owners match unified map exactly; every N|S matches --collect-only; every limb/gap above named.

- [FIX] Owner column abandons unified map 5-owner scheme: Unified map (.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:82-88) defines exactly 5 owners: runner 67, checkers 83, setup-testing 15, semantic 4, root 15. r2 invents 10 tokens (tests-infra/baseline/autofix/configs/setup/golden/integration) and assigns e.g. test_suppression file to semantic. The inter-dep file EXISTS in-repo, so the uncertainty claim is false. Restore 5-owner column, 67/83/15/4/15 counts, and checkers-file/semantic-symbol split. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Per-module N/S counts systematically wrong (~25 files): Per-file --collect-only truth (default|slow): asyncio 15|0 vs 4, beartype 16 vs 5, generic-key 18 vs 2, missing-return 15 vs 4, no-try-import 14 vs 2, stub 54 vs 23, callable 36 vs 12, class 27 vs 9, coverage 57 vs 11, docstring 28 vs 8, normalizer 18 vs 4, unnamed 11 vs 2, autofix 25 vs 20, baseline-diff 15 vs 3, baseline-edge 16|2 vs 12|1, parsers 45 vs 6, config-consistency 11 vs 9, extra-tools 44 vs 21, extra-downstream 4|1 vs 3|1, lint-runner 58 vs 41, lint-integration 40|1 vs 19|1, stats 87 vs 29, setup 51 vs 31, setup-install 21|1 vs 7|1, t11 16|1 vs 17|1, golden 31 vs 30, semantic-check 82|3 vs 19|3, threshold 80 vs 2, suppression 40|2 vs 42|1, noise-filter 0|2 vs 2|2. r2 counts defs, not collected (parametrized) tests, violating its own N=default convention. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Pinning inventory drops ~14 blocking-debt limbs as pinned/omitted: Product flags exist with zero test pins: cli.py:292-296 --force-fix + PYTHON_SETUP_LINT_FORCE_FIX, :317-321 --format, :339-343 --cwd, :363-367 --config-status; grep tests for force-fix/config-status hits none; MAIN_ARGPARSE_CASES (_factories_tables.py:148-173) covers only path/fix/exclude/package-name/tools/default-py-dirs. Config gaps: _SHIPPED_CONFIG_FILES has 11 labels (_config.py:8-20) but t1b asserts 7-label subset (test_t1b_self_discovery.py:60-69); _config_flag_for mypy/rumdl/ty branches (cmd_build.py:108-124) only yamllint-tested; dispatch scopes ty src / pylint-pyi src / pylint-tests tests / tach whole-repo (dispatch.py:46-137), pyright tests/** exclusion (pyrightconfig.json:10-20), rumdl tests/data exclusion (rumdl.toml:3) have no direct pins. r1 listed ~15 blocking-debt limbs; r2 keeps only ty-scope. Restore all. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Repo-self-lint removal list incomplete (1 of 6 groups): Still present at HEAD: test_pyright_noise_filter.py:17-50 (module-slow, run_lint on repo_root), test_setup.py:326 TestModuleSizeGates, test_runner_private_imports.py:69 repo-AST scan, test_autofix_conflict_integration.py:44 TestRunLintFixDownstream (slow), test_setup_install.py:310-325 TestDownstreamIntegration (Path.home()/.tmp write), test_t9_7_compose_pyright_live.py:31 hardcoded /home/slava checkout. r2 keeps noise-filter/live as keep and omits the other four, claiming only self-lint is repo-self. List all six definite groups for removal with surviving gates (uv run lint, unit filter tests, integration.py). (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Planned-path reservations omit epic conftest/assumption paths: plan-1.2.yaml:123-124,315-316 reserves tests/checkers/conftest.py (epic-created) and tests/assumptions runtime/decision/cache modules plus _decision_backend/_decision_cache; all verified absent at HEAD. r2 omits the conftest and assumption reservations and invents tests/runner/conftest.py, runner/runtime/, tests/runner/runtime/ with no plan citation, and mis-owns tests/conftest.py as tests-infra (unified map: root). Restore epic reservations verbatim. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Symbol exclusions drop check_if_meaningful and _OPTIONAL_IMPORT_PATTERNS: Unified map (output.yaml:85) lists semantic symbol exclusions inside checkers files: _base.py:143-238 check_if_meaningful (+_base.pyi:69-96) and conformance/no_try_import_checker.py:12 _OPTIONAL_IMPORT_PATTERNS. r2 section 4 drops both and mis-owns test_suppression_justification_checker.py as semantic (row 24) instead of checkers-file with TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. Restore both symbols and file/symbol separation. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Duplicate-cluster inventory regressed (helper/cluster merges lost): Verified at HEAD: _make_tc x13, _walk_and_release x10, _msg_ids x8 across tests/checkers; exact parser-completeness duplicate (test_t3_coverage.py:35-45 vs test_lint_runner_stats.py:72-77); autofix fake-branch vs real-git overlap; setup 6x install() in test_setup_install.py:263-266; _UvCallRecorder x2. r2 sets duplicate-of to -- for nearly all rows and replaces 7 r1 clusters with 4 merges, losing surviving-coverage mapping. Restore duplicate-of inventory or explicitly justify each dropped cluster. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Removing default pipeline smoke leaves no default full-pipeline pin: Default collect (1361/1379, 18 deselected) contains zero tests/integration.py rows (explicit-only 9-test gate), so test_real_pipeline_smoke.py (1 default test) is the sole default full-pipeline smoke. r2 removes it with survivor tests/integration.py:60-118 + :331-389, leaving no default full-pipeline pin. Keep the smoke or name a default-collected surviving pin. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Slow budget miscounts baseline-edge and suppression slow tests: TestPerfBenchmark (test_baseline_diff_edge.py:75-110) holds BOTH slow tests (:76 and :91); file truth is 16 default + 2 slow, but row 33 claims 12|1 and section 6.2 books 1 slow. Suppression truth is 40|2 but row 24 claims 42|1 (section 4 correctly says 2). Dropping bench(1)+self-lint(1)+perf-class(2)+extra-perf(1) yields 18->13, not 18->14. Recompute slow budget from slow truth table. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)
- [FIX] Integration runtime ~10-20s contradicts measured 106.61s: coding-rules-audit measured 9 passed in 106.61s (output.yaml:27); r1 reported ~65-107s explicit. r2 row 28 claims ~10-20s with no evidence, understating the explicit-gate cost ~5x for replan scheduling. Re-measure or restore 65-107s with measurement conditions (WSL2/Python 3.14.4/warm-cache +/-30%). Uncertainty: runtimes are environment-sensitive; self-lint exit-123 failure is worktree-state-sensitive. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml)

- [OPTIONAL] Confirm: 4 r1 fixes verified correct at HEAD: Verified correct: bench 241 LoC/0 default/1 slow at :118-119; TestPublicSymbolSurface 19-name loop at test_stub_fidelity_invariants.py:287-307 is the sole stub_fidelity surface lock (grep: only file); golden 152-198 canonical/empty/mapping pins kept; _semantic.pyi wc -l = 27 so 1-27. No action; carry forward.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
