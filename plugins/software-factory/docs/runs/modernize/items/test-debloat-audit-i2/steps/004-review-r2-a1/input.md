# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

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

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..53ea966
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md
@@ -0,0 +1,75 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
+
+## Assignment
+{
+  "slug": "test-debloat-audit-i2",
+  "kind": "fact-finder",
+  "title": "Inventory redundant tests and pinning limbs",
+  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
+  "outlineRef": "test-debloat-audit",
+  "milestone": "M4",
+  "wave": 4,
+  "deps": [
+    "coding-rules-audit-i2",
+    "consolidate-integration-helpers-i2",
+    "golden-contract-hardening"
+  ],
+  "scenarioRefs": [
+    "M4-2",
+    "M4-3"
+  ],
+  "citations": [
+    "CodingRules.md:230-306",
+    "CodingRules.md:139-159",
+    "AGENTS.md:87-93",
+    "pyproject.toml:49-49",
+    "tests/checkers/test_semantic_check.py:1-7",
+    "tests/checkers/test_semantic_threshold.py:19-25"
+  ]
+}
+
+## Task Intent
+# modernize
+
+Modernize the project while preserving every material lint/check behavior.
+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
+- Remove redundant tests.
+- Replace the embedding/rerank based justification/comment check
+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
+
+
+## Context & Citations
+[
+  "CodingRules.md:230-306",
+  "CodingRules.md:139-159",
+  "AGENTS.md:87-93",
+  "pyproject.toml:49-49",
+  "tests/checkers/test_semantic_check.py:1-7",
+  "tests/checkers/test_semantic_threshold.py:19-25"
+]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..8dc394c
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: research
+attempt: 1
+fixRound: 1
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T16:22:16.285Z
+session: 01a1bbf7-babc-71d7-a34e-2ce36aa311eb
+endedAt: 2026-11-08T16:36:00.072Z
+usage:
+  inputTokens: 125911
+  outputTokens: 76848
+  costUsd: 0.088857
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T16-22-17-020Z_01a1bbf7-babc-71d7-a34e-2ce36aa311eb
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..e7bbff9
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,402 @@
+status: ok
+summary: "Read-only test-debloat audit at HEAD aabf0d8. Re-globbed the 184-file
+  universe and 73 tracked tests-minus-tests/data files; owner counts match
+  coding-rules-audit-i2 exactly (runner 67, checkers 83, setup-testing 15,
+  semantic 4, root 15). Audited 59 test modules (57 dispositioned; 2 semantic
+  whole-file exclusions) plus 14 helper/fixture files. Default suite: 1357
+  passed, 4 skipped, 18 deselected in 30.91s; 18 slow tests are excluded by
+  default; tests/integration.py is an explicit 9-test gate. Found 7
+  duplicate/overlap clusters (baseline diff, parser/statistics, autofix, stub
+  fidelity, setup install, checker helpers, golden helpers), ~1.3-1.8k LoC and
+  ~5-7s default-runtime reduction, 6 definite repo-self/repo-layout test groups
+  for removal, and 15 blocking-debt pinning gaps (CLI
+  force-fix/cwd/config-status/format, config flags/scopes for
+  mypy/rumdl/ty/pylint-tests/pylint-pyi/pyright tests-data, tests-data
+  exclusions). Semantic files/symbol and 6 planned paths are reserved and must
+  not be claimed by this audit."
+findings: |-
+  # Test debloat audit — HEAD aabf0d8
+
+  ## 0. Verification basis
+
+  - HEAD `aabf0d8`; `git status --short` and `git diff --stat` are empty (read-only probes; no repository writes). Product tree is the same tree audited by `coding-rules-audit-i2` at `5e466ac` plus factory wrapper commits.
+  - `uv run pytest -q`: **1357 passed, 4 skipped, 18 deselected, 30.91s**. `uv run pytest -q --collect-only`: 1361/1379 collected. `uv run pytest -q --collect-only -m slow`: **18 slow tests** (excluded by `pyproject.toml:49`).
+  - `uv run pytest tests/integration.py -q`: 9 tests collected; dependency report records **9 passed in 106.61s** (`.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:5-7`); the context pack records ~65s. This module is deliberately not collected by the default `test_*.py` pattern.
+  - Owner-map re-glob: `git ls-files 'src/**' 'scripts/**' 'tests/**' | grep -v '^tests/data/' | wc -l` = **184**; `git ls-files 'tests/**' | grep -v '^tests/data/' | wc -l` = **73**; owner counts = **runner 67, checkers 83, setup-testing 15, semantic 4, root 15** (sum 184, no duplicates). This exactly matches the authoritative map in `.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:78-95,125`.
+  - Test universe: 59 test modules (24 under `tests/checkers/`, 28 under `tests/runner/`, 2 setup-testing modules in `tests/`, 5 root modules incl. `tests/assumptions/`, and the 2 semantic modules counted inside checkers) + 14 helper/fixture files = 73. Test-module LoC = **14,664**; helper/fixture LoC = **3,693**; total 18,357.
+  - All line references below are repository paths; owner values are copied unchanged from the coding-rules map. File ownership is kept separate from symbol-level skips (section 5).
+
+  ## 1. Executive result
+
+  - **7 duplicate/overlap clusters**: baseline diff (4 files), parser/statistics (4 files), autofix conflict (3 files), stub fidelity (3 files), setup install (2 files + conftest), checker helper duplication (13 `_make_tc` / 10 `_walk_and_release` / 8 `_msg_ids` definitions), golden helper tests vs integration.
+  - **Definite repo-self/repo-layout test removals**: `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_setup.py::TestModuleSizeGates`, `test_runner_private_imports.py::test_tests_import_privates_only_from_defining_submodule`, `test_autofix_conflict_integration.py::TestRunLintFixDownstream`, `test_setup_install.py::TestDownstreamIntegration`.
+  - **Optional slow/one-off removals**: `test_bench_runner_overhead.py`, `test_t9_7_compose_pyright_live.py`, `test_extra_tools_downstream.py::test_run_lint_extra_given_startup_then_overhead_within_10_percent`, `test_baseline_diff_edge.py::test_diff_baseline_50k_end_to_end_under_1s`.
+  - **Blocking-debt pinning gaps**: CLI `--force-fix`, `--cwd`, `--config-status`, `--format`; config flags for mypy/rumdl/ty and pylint-tests/pylint-pyi rcfiles; tool scopes for ty/src, pylint-pyi/src, pylint-tests/tests, pyright `tests/**`, mypy `.`, tach whole-repo; complete 11-label shipped-config discovery; tests/data/root-owned exclusions; `PYTHON_SETUP_LINT_FORCE_FIX`; console-script and `python -m` entry points.
+  - **Reserved/excluded**: `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `TestSuppressionRerankerPipeline` (semantic); `tests/checkers/conftest.py`, `tests/assumptions` runtime/decision/cache modules, and the four `_decision_backend`/`_decision_cache` source paths (semantic epic). Do not create or claim these in the debloat work.
+  - **Budget estimate**: ~1,300-1,800 test LoC removed (7-10% of test LoC); default runtime 30.9s -> ~24-26s; slow set reduced by ~8-10 tests. The largest single runtime win is `test_setup_install.py` (6.53s), where six full `install()` runs can become one install plus six assertions.
+
+  ## 2. Per-module inventory and dispositions
+
+  Legend: **K** keep, **M** merge, **R** rewrite (parametrize/trim), **X** remove, **E** excluded. Runtime is measured default runtime from `pytest --durations=0`; `<0.1s` means no test exceeded 5ms. `slow` means excluded by default.
+
+  ### 2.1 Checkers owner (`tests/checkers/**` except the two semantic files)
+
+  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
+  |---|---|---|---|---|---|---|---|---|
+  |`test_asyncio_timeout_checker.py`|await without timeout; outer/inner scope; negatives|—|R|same 4 behavior groups in a parametrize table|124 LoC/15 cases; `_make_tc`/`_walk_and_release` duplicated|checkers|124|<0.1s|
+  |`test_bare_except_comment_checker.py`|W9738 bare/named except without justification; skip comment/reraise/named|partial W9704 heuristic path in suppression tests|R|same 11 detect/skip cases as two tables|175/11; repeated helpers|checkers|175|<0.1s|
+  |`test_beartype_checker.py`|missing `@beartype` public fn; private/decorated skip; source-root filter|—|K|same 16 cases|distinct and already table-driven|checkers|102|<0.1s|
+  |`test_generic_key_dict_checker.py`|`dict[Any, ...]` detection; negatives|—|K|same 18 cases|already parametrized|checkers|116|<0.1s|
+  |`test_missing_error_chain_checker.py`|raise-in-except without `from`; skip chained/bare/outside|—|R|same 12 cases in detect/skip tables|192/12; one class per scenario|checkers|192|<0.1s|
+  |`test_missing_return_annotation_checker.py`|missing return annotation; skips; source-root; mixed|—|R|same 15 cases|169/15; repeated helper defs|checkers|169|<0.1s|
+  |`test_no_try_import_checker.py`|try/except import detection; negatives|—|K|same 14 cases|already table-driven|checkers|51|<0.1s|
+  |`test_pyi_underscore_checker.py`|private symbols in `.pyi`; public/dunder/type-checking guards|—|R|same 9 cases as one table|121/9; one method per input shape|checkers|121|<0.1s|
+  |`test_redundant_type_guard_checker.py`|redundant isinstance guard; skip cases/class scope|—|R|same 18 cases|240/18; four scenario classes|checkers|240|<0.1s|
+  |`test_semantic_check.py`|semantic import fallback; default-user/reranker fallback; heuristic patterns; threshold/reranker pairs|`test_semantic_threshold.py`; heuristic pattern tests|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|506|82 default + 3 slow|
+  |`test_semantic_threshold.py`|30 meaningful + 50 meaningless comment threshold|`test_semantic_check.py` heuristic patterns|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|135|80|
+  |`test_silent_except_checker.py`|silent except detection; skip raise/logging|—|R|same 14 cases|221/14; four scenario classes|checkers|221|<0.1s|
+  |`test_structlog_checker.py`|`logging.getLogger`/printf/fstring detection; skips|—|R|same 14 cases|141/14; many one-line methods|checkers|141|<0.1s|
+  |`test_stub_checker.py`|checker name/messages/register/state/coverage/import contract/var fidelity/pipeline|partial stub fidelity integration cases|K/R|same 54; move `register_checker` mock contract to assumptions|456/54; one third-party mock assertion at `:100-106`|checkers|456|<0.1s|
+  |`test_stub_checker_callable.py`|param descriptors; compare callable/annotations/returns; ctx; subprocess integration|`test_stub_fidelity_invariants.py:323-413` pure helpers/ctx|K, trim subprocess to 1-2 rows|callable unit matrix + one subprocess smoke|276/36; 1.09s from 2 subprocess rows|checkers|276|1.09s|
+  |`test_stub_checker_class.py`|class bases/methods/attrs/ClassVar; E97B1/E97B2; subprocess integration|`test_stub_fidelity_invariants.py:369-383` pure helpers|K, trim subprocess to 1-2 rows|class unit matrix + one subprocess smoke|155/27; 3.04s from 5 subprocess rows|checkers|155|3.04s|
+  |`test_stub_coverage.py`|coverage helpers; path/test/opt-out/init/trivial/main/source-root; emit violations|—|K|same 57 cases|param tables already centralized|checkers|191|0.02s|
+  |`test_stub_docstring_checker.py`|docstring location and `Returns:` rules|—|K|same 28 cases|distinct|checkers|145|<0.1s|
+  |`test_stub_fidelity_invariants.py`|E97B1-4/W97B5 message-level invariants; pure helpers; ctx; orchestrator|callable/class unit matrices; ctx tests|M|keep invariant scenario classes + orchestrator; remove `TestComparePureHelpersDirect`/`TestCtxConstruction`/`TestPublicSymbolSurface`|428/35; ~135 duplicate LoC|checkers|428|<0.1s|
+  |`test_stub_normalizer.py`|AnnotationNormalizer infer/AST walk/rewrites|—|K|same 18 cases|already parametrized|checkers|91|<0.1s|
+  |`test_suppression_justification_checker.py`|W9704 justified/unjustified; data strings; Any params/returns; reranker pipeline|semantic heuristic tests (excluded)|K/R|same 40 default cases; 2 slow reranker cases stay semantic-owned|390/40; `TestSuppressionRerankerPipeline` is a semantic symbol skip|checkers (file) / semantic (symbol)|390|0.01s + 2 slow|
+  |`test_tmp_path_checker.py`|tempfile in tests; skips; file patterns/imports|—|R|same 27 cases|219/27; seven scenario classes|checkers|219|0.04s|
+  |`test_trivial_wrapper_checker.py`|trivial wrapper detection; skip overload/abstract/self/recursive/signature|—|R|same 19 cases|259/19; nine scenario classes|checkers|259|0.27s|
+  |`test_unnamed_tuple_dict_checker.py`|unnamed tuple/dict values detection; negatives|—|K|same 11 cases|already table-driven|checkers|99|<0.1s|
+
+  ### 2.2 Runner owner (`tests/runner/**` except `test_setup*.py`)
+
+  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
+  |---|---|---|---|---|---|---|---|---|
+  |`test_autofix_conflict.py`|git changed-file snapshots; E999 parse; target paths; env opt-out; observability; Windows paths|`test_autofix_conflict_apply.py` branch matrix|K/M|same unit classes; absorb apply matrix|449/25; three-file split|runner|449|0.18s|
+  |`test_autofix_conflict_apply.py`|`_apply_autofix_conflict_aware` no-conflict/staged/unstaged/skip/E999/no-E999/untracked|`test_autofix_conflict.py`; `test_autofix_conflict_integration.py`|M|merge branch rows into `test_autofix_conflict.py`|318/8; duplicates real-git cases at `:291-399`|runner|318|0.17s|
+  |`test_autofix_conflict_integration.py`|run-lint fix dispatch; precommit template; real-git staged/E999|apply fake branches; repo self-lint|K/X|keep `TestRunLintFixDispatch`, `TestPrecommitTemplateHasFix`, `TestAutofixRealGitIntegration`; remove `TestRunLintFixDownstream`|399/12; repo downstream test at `:44-112`|runner|399|1.02s + 1 slow|
+  |`test_baseline_diff.py`|`_compare_sorted`; none-position; drift-resistant diff; perf|`test_baseline_diff_edge.py`, `test_baseline_diff_parsers.py`, integration baseline matrix|M|target consolidated baseline module: compare-sorted + drift-resistant|249/15; split baseline surface|runner|249|<0.1s|
+  |`test_baseline_diff_edge.py`|mixed schema; error paths; peek/fallback; dedup; legacy shape; capture-on-disk; 50k perf|`test_baseline_diff.py`, `test_baseline_diff_parsers.py`|M|keep mixed-schema/error/peek/dedup/capture; keep one 50k perf row|308/16; perf `:75-132`|runner|308|<0.1s + 2 slow|
+  |`test_baseline_diff_parsers.py`|45 record-parser rows; capture schema; capture edge; compare-sorted edge; parser edge|`test_baseline_diff.py`; `test_t3_coverage.py` parser edge|K/M|keep `TestRecordParsers`; move capture/compare rows to baseline module|486/45; parser table is the pinning limb|runner|486|<0.1s|
+  |`test_bench_runner_overhead.py`|per-tool time/RSS benchmark; runner overhead threshold|`test_real_pipeline_smoke.py` (pipeline), `test_extra_tools_downstream.py` perf|X (optional)|no behavior contract; `uv run lint` statistics/time output|241/2 slow; one-off G-5 evidence|runner|241|slow|
+  |`test_config_consistency.py`|pylintrc DESIGN/STUB-CHECKER/SIMILARITIES consistency|—|K|same 11 cases|config contract; keep|runner|86|<0.1s|
+  |`test_extra_tools.py`|extra-tool load/validate/merge/build/statistics/strategy fallback|`test_extra_tools_downstream.py` downstream|K|same 44 cases|unit contract|runner|346|<0.1s|
+  |`test_extra_tools_downstream.py`|extra downstream pipeline; statistics surface; startup overhead|`test_extra_tools.py`; bench|K/X|keep `TestRunLintExtraDownstreamIntegration` + statistics; remove startup-overhead perf row|209/4 (1 slow); perf `:112-209`|runner|209|<0.1s + 1 slow|
+  |`test_lint_runner.py`|ToolSpec; register identity; build command/strategies; path helpers; detect-secrets bootstrap; tach config; pylintrc; observability; print/result; pyright summary|`test_runner_format_contract.py` (registry), `test_lint_runner_stats.py` (registry)|K|same 58 cases; remove unnecessary `too-many-lines` disable at `:7`|479/58; file is under 500 LoC|runner|479|0.20s|
+  |`test_lint_runner_integration.py`|capture baseline; diff matrix; edge/path errors; overwrite; orchestration; main argparse/exit; run_lint integration; run_cmd|`test_baseline_diff*.py`; `tests/integration.py`|K/M|keep CLI/exit/run_lint/run_cmd; move baseline matrix to baseline module; remove unnecessary disable at `:1`|418/40; baseline section `:52-156`|runner|418|1.19s + 1 slow|
+  |`test_lint_runner_stats.py`|statistics flags/parsers; sort/group; malformed pyproject; registry/register/generic/fallback; invalid group|`test_t3_coverage.py` parser completeness; `test_lint_runner.py` registry|K/M|keep statistics/group/fail-fast; merge registry semantics with `test_lint_runner.py`; absorb t3|380/87; duplicate completeness at `:72-77`|runner|380|<0.1s|
+  |`test_parsers_hypothesis.py`|property invariants for record/statistics parsers (never-raise, sort, idempotence, empty/garbage)|explicit parser edge tests|K|same 66 property cases|CodingRules `hypothesis` requirement; keep|runner|432|2.95s|
+  |`test_pyright_noise_filter.py`|repo-root pyright verify-types noise filter; bypass bite|`test_lint_runner.py:438-479`|X|unit filter tests already pin summary extraction|113/2 slow; repo self-lint|runner|113|slow|
+  |`test_real_pipeline_smoke.py`|full 14-tool pipeline on synthetic project; all sections present|`tests/integration.py` full pipeline|K|same one default smoke|42/1; 4.17s but sole default full-pipeline smoke|runner|42|4.17s|
+  |`test_runner_format_contract.py`|ruff format check vs mutate; config discovery/flag; registry constants; pipeline modes; golden counts|`test_lint_runner.py::TestToolSpec`; `test_lint_runner_stats.py::TestLintToolRegistry`|K|same 12 cases; this is the 14-tool/ruff-format pinning limb|157/12|runner|157|0.02s|
+  |`test_runner_private_imports.py`|runner `__all__`/namespace no private; init no private submodule; tests import privates only from defining module|—|K/X|keep first 3 API-surface tests; remove repo-wide test scan|95/4; scan at `:59-95`|runner|95|0.12s|
+  |`test_self_lint_clean.py`|full repo self-lint exit 0/no crash/no skip/score 10|`uv run lint` gate|X|`uv run lint` (not pytest)|59/1 slow; policy says pytest never asserts repo passes lint|runner|59|slow|
+  |`test_setup.py`|setup helpers/state/update/CLI/templates/config drift/module-size gates|`test_setup_install.py` install artifacts; conftest|K/R|keep setup state/update/templates/config drift; remove `TestModuleSizeGates`; merge install CLI with install module|385/51; module-size gates `:326-345`; hardcoded dev_path `:252,277`|setup-testing|385|2.89s|
+  |`test_setup_install.py`|fresh install artifacts; idempotency; existing precommit; missing pyproject; step errors; downstream|`test_setup.py::TestMainCLI`; conftest `configured_project`; `tests/integration.py`|M/R|one install + six artifact assertions; merge two idempotency tests; fix dev_path; remove/rewrite downstream|371/21; six installs in `:263-266`; downstream `:310-371`|setup-testing|371|6.53s + 1 slow|
+  |`test_t11_health_checks.py`|test_checked_main argv; precommit config validators; installed-template validation|`test_setup_precommit.py` (different layer)|K|same 16 cases|keep; slow real-subprocess case is marked slow|runner|383|0.02s + 1 slow|
+  |`test_t1b_self_discovery.py`|`_default_config_paths`; `_infer_package_name`; yamllint/ruff config flag|`test_runner_format_contract.py` config discovery|K|same 13 cases; extend to all 11 labels|169/13; partial shipped-label coverage|runner|169|<0.1s|
+  |`test_t3_coverage.py`|parser completeness; parser edge cases; aggregate statistics; statistics observability; print-table edges|`test_lint_runner_stats.py` parser completeness/statistics|M|merge statistics/observability into stats module; remove duplicate completeness rows|390/33; duplicate `:35-45`|runner|390|<0.1s|
+  |`test_t5_compose_ruff.py`|RunnerConfig override fields; compose ruff no-override/with-overrides; pyproject cache; run_lint consumption|`test_t9_7_compose_pyright.py` pattern only|K|same 21 cases|ruff config compose pinning limb|runner|366|0.01s|
+  |`test_t9_7_compose_pyright.py`|compose pyright no-rewrite/copy-to-cwd; run_lint consumption|`test_t9_7_compose_pyright_live.py`|K|same 15 cases|pyright config compose pinning limb|runner|281|<0.1s|
+  |`test_t9_7_compose_pyright_live.py`|live pyright `.venv` collapse; hardcoded external checkout|`test_t9_7_compose_pyright.py`|X|unit compose + `test_real_pipeline_smoke.py`|197/2 slow; environment-specific `:31`|runner|197|slow|
+  |`test_testing_fakes.py`|`make_lint_result`; fake run_cmd dispatch; test helper contracts|—|K|same 19 cases|product `testing.py` behavior|runner|197|0.03s|
+
+  ### 2.3 Setup-testing owner (additional modules outside `tests/runner`)
+
+  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
+  |---|---|---|---|---|---|---|---|---|
+  |`tests/test_setup_config_symlinks.py`|symlink create/skip/fallback/copy; fake package; real bundled configs|`test_setup_install.py` config-copy artifacts (partial)|K|same 7 cases|distinct symlink contract|setup-testing|162|<0.1s|
+  |`tests/test_setup_precommit.py`|ruff version resolution/v-prefix/fallback/existing-config/template format|`test_t11_health_checks.py` precommit validators (different layer)|K|same 7 cases|distinct `_setup_precommit` contract|setup-testing|176|<0.1s|
+  |`tests/runner/test_setup.py`|see 2.2|—|K/R|see 2.2|see 2.2|setup-testing|385|2.89s|
+  |`tests/runner/test_setup_install.py`|see 2.2|—|M/R|see 2.2|see 2.2|setup-testing|371|6.53s|
+
+  ### 2.4 Root owner (`tests/` root + `tests/assumptions/**`)
+
+  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
+  |---|---|---|---|---|---|---|---|---|
+  |`tests/integration.py`|golden pipeline; config overlay; resetup idempotency; dry-run hooks; clean consumer; pre-commit; baseline paths; per-tool parity; rumdl rules|`test_golden.py` helper tests; `test_real_pipeline_smoke.py`|K|9 end-to-end scenarios; golden multiset + oracle + tool counts|behavior-preservation safety net; explicit 9-test gate|root|498|~65-107s explicit|
+  |`tests/test_golden.py`|finding key/normalize/serialize/collect/assert/update guard/oracle/tool coverage/slice|`tests/integration.py`|R/trim|keep failure-path/update-guard/oracle/tool-coverage tests; remove serialization roundtrip duplicates|414/31; helper internals|root|414|<0.1s|
+  |`tests/assumptions/test_astroid_contracts.py`|astroid stream/doc_node/nodes_of_class/span|—|K|4 contracts|sole third-party pinning location|root|153|0.08s|
+  |`tests/assumptions/test_beartype_contracts.py`|beartype TYPE_CHECKING-only forward-ref behavior|—|K|1 contract|sole third-party pinning location|root|65|<0.1s|
+  |`tests/assumptions/test_pylint_contracts.py`|PyLinter register/check lifecycle; CheckerTestCase capture; MessageDefinitionTuple|—|K|3 contracts|sole third-party pinning location|root|175|<0.1s|
+  |`tests/conftest.py`|session PATH; `empty_project`; `configured_project`; `tmp_baseline`; `runner_config_factory`; `isolated_runner_registries`; `sample_project`|—|K/R|same fixtures; fix hardcoded `dev_path`|163; hardcoded path `:86`|root|163|fixtures|
+  |`tests/_golden.py`|golden helpers|—|K|same|test infrastructure|root|446|infra|
+  |`tests/_project_helpers.py`|shared project/git/config helpers|—|K|same|already consolidated by M2|root|204|infra|
+
+  ### 2.5 Semantic exclusions
+
+  |Module/symbol|Behaviors|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
+  |---|---|---|---|---|---|---|---|
+  |`tests/checkers/test_semantic_check.py`|import/default-user/reranker fallbacks; heuristic patterns; threshold; reranker pairs|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|506|82 default + 3 slow|
+  |`tests/checkers/test_semantic_threshold.py`|30 meaningful + 50 meaningless threshold rows|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|135|80|
+  |`TestSuppressionRerankerPipeline` (`tests/checkers/test_suppression_justification_checker.py:357-390`)|two slow reranker comments|E|semantic symbol owner|symbol exclusion inside a checkers-owned file|semantic|34-class|2 slow|
+
+  ## 3. Duplicate clusters and merge plan
+
+  ### 3.1 Baseline diff cluster (4 files)
+
+  Evidence: `test_baseline_diff.py:28-249` (`TestCompareSorted`, `TestDriftResistantDiff`), `test_baseline_diff_edge.py:25-308` (`TestMixedSchemaLoad`, `TestPerfBenchmark`, `TestDiffBaselineErrors`, `TestPeekFallbackTools`, `TestFallbackTracking`, `TestMultiSavedToolDedup`, `TestMixedShapeLegacyOutput`, `TestCaptureBaselineOnDisk`), `test_baseline_diff_parsers.py:39-486` (`TestRecordParsers`, `TestCaptureSchemaV2`, `TestCaptureOneEdgeCases`, `TestCompareSortedEdgeCases`, `TestParserEdgeCases`), and `test_lint_runner_integration.py:52-156` (`TestCaptureBaseline`, `test_diff_baseline_matrix`, `TestDiffBaselineEdgeCases`).
+
+  Merge target: **`test_baseline_diff.py`** for capture/compare/diff/overwrite/error/mixed-schema; **`test_baseline_diff_parsers.py`** for the 45-row record-parser table and parser edge cases. Move `DIFF_BASELINE_CASES`/`DIFF_EDGE_CASES`/`DIFF_EDGE_INVARIANTS` consumption out of `test_lint_runner_integration.py`; leave CLI/exit/run_lint there. Remove `test_diff_baseline_50k_end_to_end_under_1s` (duplicate perf; keep `test_50k_line_baseline_compares_under_200ms`). Estimated -250 to -350 LoC; no default runtime change.
+
+  ### 3.2 Parser/statistics cluster (4 files)
+
+  Evidence: `test_lint_runner_stats.py:66-79` (`test_statistics_parser`, `test_statistics_parsers_given_all_tools_then_covered`), `test_t3_coverage.py:35-63` (`TestParserCompleteness`), `test_t3_coverage.py:67-216` (`TestParserEdgeCases`), `test_t3_coverage.py:222-390` (aggregate/observability/print-table), `test_parsers_hypothesis.py:90-432` (property invariants), `test_baseline_diff_parsers.py:39-217` (record parsers).
+
+  Exact duplicate: `test_t3_coverage.py:35-45` asserts `TOOLS - FORMATTER_ONLY - STATISTICS_PARSER_TOOLS == empty`; `test_lint_runner_stats.py:72-77` already asserts `STATISTICS_PARSER_TOOLS == frozenset(_STATISTICS_PARSERS)` and `{t.name for t in TOOLS} - FORMATTER_ONLY == statistics_tools`, which implies the same and more. Remove the two t3 completeness rows; keep the third flags-alignment row only if it is not subsumed by `STATISTICS_FLAG_CASES` (`_factories_tables.py:139-157`). Merge t3 statistics observability/print-table into `test_lint_runner_stats.py`. Keep `test_parsers_hypothesis.py` as the property layer and `test_baseline_diff_parsers.py` as the record-parser table. Estimated -80 to -120 LoC.
+
+  ### 3.3 Autofix conflict cluster (3 files)
+
+  Evidence: `test_autofix_conflict.py:73-449` (git changed files, E999 parse, target paths, env opt-out, observability, canary label, Windows paths), `test_autofix_conflict_apply.py:29-318` (no-conflict/staged-only/unstaged-only/staged+unstaged/E999/no-E999/no-modification/untracked), `test_autofix_conflict_integration.py:44-399` (run-lint fix dispatch, precommit template, real git).
+
+  Duplicate behavior: apply `:120-147` (staged+unstaged skipped) vs integration `:291-336` (real git same file skipped); apply `:148-205` (E999 revert) vs integration `:372-399` (real git E999 revert); apply no-conflict/staged-only/unstaged-only vs real-git rows. Merge `_apply_autofix_conflict_aware` branch matrix into `test_autofix_conflict.py`; keep `test_autofix_conflict_integration.py` for **real git** + precommit template + fix dispatch, but reduce real-git rows to the two branch-complete cases. Remove `TestRunLintFixDownstream` (`:44-112`, repo self-lint). Estimated -200 to -280 LoC; ~-0.2s default.
+
+  ### 3.4 Stub fidelity cluster (3 files)
+
+  Evidence: `test_stub_checker_callable.py:167-265` (compare descriptors/annotations/returns, ctx), `test_stub_checker_class.py:48-90` (normalize bases, public method, ctx), `test_stub_fidelity_invariants.py:323-413` (`TestComparePureHelpersDirect`, `TestCtxConstruction`). The invariants file's pure-helper tests are strict subsets: e.g. `test_compare_callable_descriptors_given_identical/count_mismatch` vs callable `:167-189`; `test_compare_callable_annotations_*` vs `:191-214`; `test_compare_return_annotations_*` vs `:216-243`; `test_normalize_bases_*`/`test_is_public_method_*` vs class `:48-72`; `TestCtxConstruction` vs callable `:245-265` and class `:74-90`. Keep the parametrized unit matrices and subprocess smoke; remove the duplicate pure-helper/ctx/public-surface classes from `test_stub_fidelity_invariants.py`. Estimated -135 LoC; ~-2s default by reducing subprocess rows in `test_stub_checker_class.py`/`_callable.py`.
+
+  ### 3.5 Setup install cluster (2 files + conftest)
+
+  Evidence: `test_setup_install.py:95-101` defines six `INSTALL_ARTIFACT_CASES`; `:263-266` runs a full `install()` for each parameter (measured 6.53s for 21 collected tests); `:272-278` has two idempotency tests (`test_second_install_skips_dep`, `test_install_given_second_install_then_no_dup`); `test_setup.py:243-290` tests `main(["install", ...])`; `tests/conftest.py:62-89` runs a session-scoped install. Merge the six artifact checks into one install + six assertions; merge the two idempotency tests; reuse `configured_project`; replace hardcoded `dev_path="/home/slava/aiexp/python-setup"` with a repo-root-derived path. Estimated -50 LoC and ~-4s default.
+
+  ### 3.6 Checker helper duplication
+
+  Evidence: `_make_tc` defined in 13 checker test modules (e.g. `test_bare_except_comment_checker.py:16-17`, `test_missing_error_chain_checker.py:16-17`, `test_silent_except_checker.py:16-17`, `test_tmp_path_checker.py:19-20`, `test_trivial_wrapper_checker.py:18-19`); `_walk_and_release` in 10 modules (e.g. `test_beartype_checker.py:31-37`, `test_missing_return_annotation_checker.py:25-32`, `test_structlog_checker.py:23-35`, `test_stub_docstring_checker.py:33-39`); `_msg_ids` in 8 modules (e.g. `test_redundant_type_guard_checker.py:27-28`, `test_silent_except_checker.py:31-32`, `test_suppression_justification_checker.py:19-20`). Move one `make_tc`/`walk_and_release`/`msg_ids` into `tests/checkers/_factories.py` (checkers-owned) and import them. Do **not** create `tests/checkers/conftest.py`; it is reserved for the semantic epic. Estimated -100 to -130 LoC.
+
+  ### 3.7 Golden helper tests vs integration
+
+  Evidence: `test_golden.py:61-414` has 31 helper-internal tests; `integration.py:60-146` exercises the same helpers end-to-end (golden multiset, oracle, tool coverage, byte-identical replay). Keep failure-path/update-guard tests (`:243-334`), oracle/tool coverage (`:359-401`), and slice tests (`:403-414`); remove serialization roundtrip duplicates (`:152-215`) that are already pinned by integration's byte-identical replay. Estimated -80 to -120 LoC.
+
+  ## 4. Pinning-limb inventory
+
+  ### 4.1 CLI and exit
+
+  |Limb|Material behavior|Surviving pinning test|Status|
+  |---|---|---|---|
+  |`main()` argparse flags `--path/--fix/--exclude/--package-name/--tools/--default-py-dirs`|acceptance and forwarding|`tests/runner/test_lint_runner_integration.py:286-293` (`test_main_argparse_given_flag_then_accepts`) + `tests/runner/_factories_tables.py:148-173`|pinned|
+  |`--help` / unknown flag exit|exit 0 / nonzero|`tests/runner/test_lint_runner_integration.py:296-307` (`TestMainCLI::test_main_exit_codes`) + `tests/runner/_factories_extras.py:502-505`|pinned|
+  |`--baseline` create/diff|baseline lifecycle|`tests/runner/test_lint_runner_integration.py:158-232` (`TestOverwriteBaseline`) and `:342-380`|pinned|
+  |`--overwrite-baseline`|rewrite existing baseline|`tests/runner/test_lint_runner_integration.py:158-232`; `tests/integration.py:295-329`|pinned|
+  |`run_lint` nonzero on new violation|exit contract|`tests/runner/test_lint_runner_integration.py:366-380`|pinned|
+  |`_run_cmd` exit 127/124|subprocess exit mapping|`tests/runner/test_lint_runner_integration.py:395-406`|pinned|
+  |`--group` / `--sort-by-rule`|statistics grouping|`tests/runner/test_lint_runner_stats.py:117-132`|pinned|
+  |`--statistics` / `--format` at run_lint level|JSON/table output|`tests/runner/test_t3_coverage.py:282-340`|pinned at API level|
+  |`--force-fix`|force autofix / skip staged+unstaged exclusion|none|**blocking debt** (only `src/python_setup_lint/runner/cli.py:292-300,390-397`)|
+  |`--cwd`|working-directory override|none|**blocking debt** (`cli.py:329-334`)|
+  |`--config-status`|print config origins and early-return|none|**blocking debt** (`cli.py:345-349,383-386`)|
+  |`--format table/json` via CLI|CLI wiring|none (API-level only)|**blocking debt** (`cli.py:317-323`)|
+  |`PYTHON_SETUP_LINT_FORCE_FIX` env|force-fix parity with CLI|none|**blocking debt** (`cli.py:390`)|
+  |console scripts `lint`/`install`/`python-setup`/`python-setup-test-checked`|entry-point wiring|none|**blocking debt** (`pyproject.toml:22-26`)|
+  |`python -m python_setup_lint`|module entry point|none|**blocking debt** (`src/python_setup_lint/__main__.py:1-5`)|
+  |setup CLI `install`/`update`/bad subcommand|setup CLI exit behavior|`tests/runner/test_setup.py:243-290`|pinned but hardcoded `dev_path` at `:252,277`|
+
+  ### 4.2 Baseline and autofix
+
+  |Limb|Material behavior|Surviving pinning test|Status|
+  |---|---|---|---|
+  |baseline capture|serialize tool output to records|`tests/runner/test_lint_runner_integration.py:52-78`; `test_baseline_diff_parsers.py:218-362`|pinned|
+  |baseline diff matrix|added/removed/multiset/reorder|`tests/runner/test_lint_runner_integration.py:79-101`; `test_baseline_diff.py:135-249`|pinned; move matrix to baseline module|
+  |baseline edge/path errors|missing/invalid/empty baseline|`tests/runner/test_lint_runner_integration.py:103-156`; `test_baseline_diff_edge.py:113-227`|pinned|
+  |baseline schema/mixed legacy|legacy upgrade/shrink|`test_baseline_diff_edge.py:25-73,228-308`|pinned|
+  |baseline parsers|45 per-tool record rows|`test_baseline_diff_parsers.py:39-217`|pinned (pinning limb)|
+  |baseline perf|50k compare/diff thresholds|`test_baseline_diff_edge.py:75-132`|pinned slow; remove one duplicate row|
+  |autofix conflict branch matrix|no-conflict/staged/unstaged/skip|`test_autofix_conflict_apply.py:29-147`; `test_autofix_conflict.py:73-122`|pinned; merge apply into conflict|
+  |E999 canary|revert broken parse|`test_autofix_conflict_apply.py:148-249`; `test_autofix_conflict_integration.py:372-399`|pinned (fake + real git)|
+  |untracked in-memory revert|no git checkout|`test_autofix_conflict_apply.py:285-318`|pinned|
+  |autofix observability|skip/revert stderr format|`test_autofix_conflict.py:303-357`|pinned|
+  |`PYTHON_SETUP_LINT_NO_AUTOFIX`|env opt-out|`test_autofix_conflict.py:226-301`|pinned|
+  |real git staging|staged/unstaged separation|`test_autofix_conflict.py:73-122`; `test_autofix_conflict_integration.py:269-399`|pinned|
+  |precommit `lint --fix` hook|template shape/args|`test_autofix_conflict_integration.py:114-187`; `tests/integration.py:249-294`|pinned; end-to-end hook dry-run in integration|
+  |fix dispatch|`run_lint(fix=True)` route|`test_autofix_conflict_integration.py:189-267`|pinned|
+  |repo downstream `uv run lint --fix`|repo self-lint completion|`test_autofix_conflict_integration.py:44-112`|**blocking/remove**: rewrite synthetic or rely on `uv run lint --fix`|
+  |`PYTHON_SETUP_LINT_FORCE_FIX`|force-fix env|none|**blocking debt**|
+
+  ### 4.3 Configs and scopes
+
+  |Limb|Material behavior|Surviving pinning test|Status|
+  |---|---|---|---|
+  |shipped config discovery|all 11 `_SHIPPED_CONFIG_FILES` labels|`tests/runner/test_t1b_self_discovery.py:36-80` (7 labels); `test_runner_format_contract.py:69-72` (ruff format); `test_lint_runner.py:123-171` (pylint)|partial; **blocking debt** for mypy/ty/rumdl/tach/pylint-tests/pylint-pyi labels|
+  |`_config_flag_for` mapping|ruff/yamllint/pyright/ruff-format|`test_t1b_self_discovery.py:154-169`; `test_runner_format_contract.py:74-77`; `test_t5_compose_ruff.py:335-345`; `test_t9_7_compose_pyright.py:208-237`|partial; **blocking debt** for mypy/rumdl/ty/pylint-tests/pylint-pyi (`cmd_build.py:111-123`)|
+  |`ruff format` check vs mutate|normal pass `--check`; fix phase mutates|`test_runner_format_contract.py:43-63,130-149`|pinned (pinning limb)|
+  |`ruff format` config flag|shipped ruff config in both modes|`test_runner_format_contract.py:66-77`|pinned|
+  |ruff config compose|banned-api/per-file-ignores/temp path|`test_t5_compose_ruff.py:88-218,274-355`|pinned|
+  |pyright config compose|no-rewrite/copy-to-cwd/read-only fallback|`test_t9_7_compose_pyright.py:66-281`|pinned|
+  |pylint rcfile discovery/complexity|config/.pylintrc precedence; no max-complexity|`test_lint_runner.py:107-186,332-345`; `test_config_consistency.py:23-85`|pinned|
+  |pylint tests/pyi rcfile discovery|`.pylintrc-tests` / `.pylintrc-pyi`|none|**blocking debt** (`dispatch.py:342-410`)|
+  |yamllint/rumdl default paths|`.` scope|`test_lint_runner.py:64-72`|pinned|
+  |tach config|tach.toml source roots|`test_lint_runner.py:309-330`|partial (file existence, not whole-repo scope)|
+  |detect-secrets baseline bootstrap|missing baseline → scan; existing → hook|`test_lint_runner.py:266-307`|pinned|
+  |extra-tools config|load/validate/merge/flag|`test_extra_tools.py:58-346`|pinned|
+  |14-tool registry|single-source names/formatter/parser partitions|`test_runner_format_contract.py:80-108,152-157`|pinned|
+  |tool scopes|ty src-only, pylint-pyi src, pylint tests tests, pyright tests/** exclusion, mypy `.`, tach whole repo|none direct|**blocking debt** (`dispatch.py:74-137`; `config/pyrightconfig.json:10-20`)|
+  |tests/data/root-owned exclusions|rumdl `tests/data`; pyright `tests/**`|none; `_project_helpers.py:68-80` only strips the rumdl exclude for the sample project|**blocking debt** (`config/rumdl.toml:3`; `config/pyrightconfig.json:10-20`)|
+  |tests/data golden counts|14 tool-count keys|`test_runner_format_contract.py:152-157`; `tests/integration.py:60-146`|pinned|
+
+  ## 5. Symbol exclusions (file ownership kept separate)
+
+  |Symbol/file|Defining evidence|Owner|Audit treatment|
+  |---|---|---|---|
+  |`tests/checkers/test_semantic_check.py` whole file|`tests/checkers/test_semantic_check.py:1-506`|semantic|excluded; keep pending semantic rewrite; its `TestBrushOffPatterns`/`TestMeaningfulPatterns` overlap `test_semantic_threshold.py` — handoff note only, no debloat disposition|
+  |`tests/checkers/test_semantic_threshold.py` whole file|`tests/checkers/test_semantic_threshold.py:1-135`|semantic|excluded; keep pending semantic rewrite|
+  |`TestSuppressionRerankerPipeline`|`tests/checkers/test_suppression_justification_checker.py:357-390`|semantic|symbol skip; the file remains checkers-owned, but do not edit this class|
+  |`check_if_meaningful`|`src/python_setup_lint/checkers/_base.py:143-238`; `_base.pyi:69-96`|semantic|not audited; checkers owner must not refactor|
+  |`_OPTIONAL_IMPORT_PATTERNS`|`src/python_setup_lint/checkers/conformance/no_try_import_checker.py:12`|semantic|not audited; must track new optional model dependency|
+  |`_semantic.py` / `_semantic.pyi`|`src/python_setup_lint/checkers/_semantic.py:1-189`; `_semantic.pyi:1-42`|semantic|whole-file exclusion|
+
+  ## 6. Planned-path reservations
+
+  |Path/glob|Owner|Status at HEAD|Evidence|
+  |---|---|---|---|
+  |`tests/checkers/conftest.py`|semantic epic|**absent**|`plan-1.2.yaml:116-125,316-317` (epic-created; do not create in debloat)|
+  |`tests/assumptions/test_*runtime*.py`|semantic epic|**absent**|`plan-1.2.yaml:316-317` (epic-created runtime-assumption modules)|
+  |`tests/assumptions/test_*decision*.py`, `test_*cache*.py`|semantic epic|**absent**|same reservation; no matching tracked file|
+  |`src/python_setup_lint/checkers/_decision_backend.py` / `.pyi`|semantic|**absent**|coding-rules map `output.yaml:78-95` (planned-path reservations)|
+  |`src/python_setup_lint/checkers/_decision_cache.py` / `.pyi`|semantic|**absent**|same map|
+  |Proposed (not reserved): `tests/checkers/_factories_stub.py`, `_factories_conformance.py`|checkers|new split targets for the 1,393-line `_factories.py`|this audit; no conflict with reserved paths|
+  |Proposed (not reserved): `tests/runner/_factories_extras_*.py`|runner|split target for 511-line `_factories_extras.py`|this audit; no conflict|
+
+  `tests/conftest.py`, `tests/_golden.py`, and `tests/_project_helpers.py` are root-owned and **not** reserved; the root owner may fix the hardcoded `dev_path` in `conftest.py:86`.
+
+  ## 7. Repo-self-lint / repo-layout tests recommended for removal
+
+  |Test|Evidence|Why remove|Surviving gate|
+  |---|---|---|---|
+  |`test_self_lint_clean.py::test_self_lint_clean`|`tests/runner/test_self_lint_clean.py:20-59`|runs full repo lint and asserts exit 0/score 10; policy: pytest never asserts this repo passes lint|`uv run lint` (AGENTS.md:9)|
+  |`test_pyright_noise_filter.py::test_pyright_noise_filter` + `..._bites_when_bypassed`|`tests/runner/test_pyright_noise_filter.py:20-113`|runs `run_lint` against repo root; duplicates unit filter coverage|`tests/runner/test_lint_runner.py:438-479` (`TestSummarizePyrightVerifyTypes`)|
+  |`test_setup.py::TestModuleSizeGates`|`tests/runner/test_setup.py:326-345`|asserts repo module LoC/pyi shape; C0302 lint already enforces|`config/.pylintrc:2`, `config/.pylintrc-tests:20`|
+  |`test_runner_private_imports.py::test_tests_import_privates_only_from_defining_submodule`|`tests/runner/test_runner_private_imports.py:59-95`|scans repo test AST; not product behavior|keep API tests `:26-57`; tach/pylint for policy|
+  |`test_autofix_conflict_integration.py::TestRunLintFixDownstream`|`tests/runner/test_autofix_conflict_integration.py:44-112`|runs `run_lint(fix=True)` on this repo; slow, self-lint-ish|synthetic fix tests + `uv run lint --fix`|
+  |`test_setup_install.py::TestDownstreamIntegration`|`tests/runner/test_setup_install.py:310-371`|writes `~/.tmp/t15-downstream` and runs install+lint; integration.py already covers install-then-lint|`tests/integration.py:223-248`|
+  |`test_t9_7_compose_pyright_live.py` (2 tests)|`tests/runner/test_t9_7_compose_pyright_live.py:29-197`|hardcoded `/home/slava/aiexp/python-setup`; live pyright; duplicate of compose unit|`tests/runner/test_t9_7_compose_pyright.py:66-281`|
+  |`test_bench_runner_overhead.py` (2 slow)|`tests/runner/test_bench_runner_overhead.py:119-241`|one-off G-5 benchmark; no behavior contract|`uv run lint` timing/statistics; optional keep-slow|
+  |`test_extra_tools_downstream.py::test_run_lint_extra_given_startup_then_overhead_within_10_percent`|`tests/runner/test_extra_tools_downstream.py:112-209`|perf threshold; not behavior|keep correctness downstream tests `:37-110`|
+  |`test_baseline_diff_edge.py::test_diff_baseline_50k_end_to_end_under_1s`|`tests/runner/test_baseline_diff_edge.py:91-132`|duplicate perf path; compare-sorted perf row remains|`test_50k_line_baseline_compares_under_200ms` `:76-90`|
+
+  ## 8. Test-infrastructure debt (fix before/with debloat)
+
+  1. **Hardcoded workstation path**: `tests/conftest.py:86` and setup tests use `dev_path="/home/slava/aiexp/python-setup"` (`tests/runner/test_setup.py:252,277`; `tests/runner/test_setup_install.py:265,274,284,288,350`; `tests/runner/test_autofix_conflict_integration.py:181`; live pyright `test_t9_7_compose_pyright_live.py:31`). `tests/integration.py:234,262` correctly uses `Path.cwd()`; use that pattern or a repo-root fixture. This is an assumption/test-infra defect, not a product behavior.
+  2. **Write outside `tmp_path`**: `tests/runner/test_setup_install.py:318` uses `Path.home() / ".tmp" / "t15-downstream"`; replace with `tmp_path` or remove with the downstream test.
+  3. **Duplicate helper definitions**: `_make_tc` x13, `_walk_and_release` x10, `_msg_ids` x8, `_UvCallRecorder` x2 (`tests/runner/test_setup.py:39-60`, `test_setup_install.py:36-58`). Move checker helpers to `tests/checkers/_factories.py`; setup recorder to one module or `tests/_project_helpers.py` (root-owned; coordinate).
+  4. **C0302 disables in test code**: `tests/checkers/_factories.py:15` (1,393 lines), `tests/runner/_factories_extras.py:1,6` (511 lines; duplicate disable), `tests/runner/test_lint_runner.py:7` (479 lines; disable unnecessary), `tests/runner/test_lint_runner_integration.py:1` (418 lines; unnecessary), `tests/checkers/test_semantic_check.py:1` (506 lines; semantic-owned). Split `_factories.py` and `_factories_extras.py`; remove unnecessary disables.
+  5. **Third-party contract outside assumptions**: `tests/checkers/test_stub_checker.py:100-106` mocks `linter` and asserts `register_checker` call shape. Plan M2 says `tests/assumptions` is the only third-party pinning location. Rewrite with a real `PyLinter`/`CheckerTestCase`, or move the contract to `tests/assumptions/test_pylint_contracts.py` (root-owned).
+  6. **Marker mismatch**: `tests/runner/test_t11_health_checks.py:37` marks the whole module `no_external_api`, but `:369-383` invokes real `pre-commit validate-config` (slow). Keep the slow marker; either split the module marker or document the exception.
+  7. **Stale docs/counts**: `AGENTS.md:10` says 1290 pass/4 skip/15 deselected; measured at HEAD is 1357/4/18. Root-owned docs update; not a test debloat item.
+
+  ## 9. Runtime and LoC budget
+
+  - Current: 14,664 test-module LoC + 3,693 helper LoC; default suite 30.91s; 18 slow tests excluded; integration 9 tests ~65-107s explicit.
+  - Conservative reduction: **-1,300 to -1,800 LoC** (baseline cluster -300, autofix -250, stub fidelity -135, checker helpers/parametrization -400 to -600, setup -50, golden -100, repo guards -500 if all optional removals land).
+  - Runtime: `test_setup_install.py` 6.53s -> ~2.5-3s (one install); stub subprocess rows ~4.1s -> ~2s; autofix ~-0.2s; repo-self removals save slow time only (default unaffected). Expected default **~24-26s**.
+  - Keep the high-value default gates: `test_real_pipeline_smoke.py` (4.17s, sole default full-pipeline smoke), `test_parsers_hypothesis.py` (2.95s, property layer), `test_lint_runner.py` (0.20s), `test_runner_format_contract.py` (0.02s), and `tests/integration.py` (golden safety net).
+
+  ## 10. Iteration-3 replan handoff
+
+  - Consume both reports: this audit + `coding-rules-audit-i2` (`output.yaml:78-95,125`). Owner map is authoritative and must not be reassigned by the test audit.
+  - Re-glob validation command and expected values:
+    - `git ls-files 'src/**' 'scripts/**' 'tests/**' | grep -v '^tests/data/' | wc -l` -> **184**.
+    - `git ls-files 'tests/**' | grep -v '^tests/data/' | wc -l` -> **73**.
+    - owner counts -> **runner 67, checkers 83, setup-testing 15, semantic 4, root 15**.
+    - `Path.exists()` is false for `tests/checkers/conftest.py`, the `tests/assumptions` runtime/decision/cache globs, and the four `_decision_backend`/`_decision_cache` paths.
+  - Re-glob catches epic-created modules before spawning subsystem epics; any new test module created by the semantic epic must be appended to the semantic owner or root-owned group, not to checkers/runner.
+  - Exclusions to carry into replan: two semantic test files, `TestSuppressionRerankerPipeline`, `check_if_meaningful`, `_OPTIONAL_IMPORT_PATTERNS`, `_semantic.py/.pyi`, `tests/checkers/conftest.py`, and the runtime/decision/cache assumption modules.
+
+  ## 11. Verification checklist against the assignment
+
+  - [x] Every test module has a disposition with surviving coverage (59 modules; 57 audited + 2 semantic exclusions).
+  - [x] Repo-self-lint / repo-layout tests are listed for removal with replacement gates (section 7).
+  - [x] Each material limb names a pinning test or a blocking-debt flag (sections 4.1-4.3).
+  - [x] Owners match the unified map: runner 67, checkers 83, setup-testing 15, semantic 4, root 15; tests-minus-data 73; universe 184.
+  - [x] File ownership is separate from symbol skips: `test_suppression_justification_checker.py` stays checkers-owned while `TestSuppressionRerankerPipeline` is semantic-owned.
+  - [x] Planned-path reservations are listed and verified absent (section 6).
+  - [x] HEAD re-glob validation is reproducible (section 10).
+contextPack: "HEAD aabf0d8 (product tree same as coding-rules-audit-i2 HEAD
+  5e466ac plus factory wrapper commits); `git status` clean; no repo writes.
+  Default suite 1357 passed/4 skipped/18 deselected/30.91s; 18 slow tests
+  excluded; tests/integration.py is an explicit 9-test gate (~65-107s). Test
+  universe 59 modules + 14 helpers = 73 tracked tests-minus-data files; 18,357
+  LoC (14,664 test + 3,693 helpers). Owner map re-globbed exactly: 184 universe
+  files, runner 67, checkers 83, setup-testing 15, semantic 4, root 15.
+  Authoritative map:
+  .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1\
+  /output.yaml:78-95,125. Reserved/absent: tests/checkers/conftest.py,
+  tests/assumptions runtime/decision/cache modules,
+  src/python_setup_lint/checkers/_decision_backend.py(.pyi),
+  _decision_cache.py(.pyi). Excluded: test_semantic_check.py,
+  test_semantic_threshold.py, TestSuppressionRerankerPipeline,
+  check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py/.pyi. Debloat
+  targets: baseline cluster (-250/-350 LoC), autofix cluster (-200/-280), stub
+  fidelity (-135), checker helpers/parametrization (-400/-600), setup install
+  (-50 LoC, -4s), golden trim (-100), repo-self/repo-layout removals (-500
+  optional). Blocking debt: CLI --force-fix/--cwd/--config-status/--format,
+  PYTHON_SETUP_LINT_FORCE_FIX, config flags/scopes for
+  mypy/rumdl/ty/pylint-tests/pylint-pyi, pyright tests/** exclusion, complete
+  11-label config discovery, tests/data exclusions, console/python -m entry
+  points. Replan must re-glob HEAD and consume both reports."
+sources:
+  - .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:78-95,125
+  - .factory/tasks/modernize/items/coding-rules-audit-i2/steps/002-review-r1-a1/input.md:258-305
+  - .factory/tasks/modernize/plan/plan-1.2.yaml:116-125,316-317,455-466
+  - .factory/tasks/modernize/plan/edits-2.0.yaml:399-400
+  - CodingRules.md:139-159,230-306
+  - AGENTS.md:9-11,87-93
+  - pyproject.toml:22-26,49-55
+  - src/python_setup_lint/runner/cli.py:274-413
+  - src/python_setup_lint/runner/dispatch.py:46-137,294-410
+  - src/python_setup_lint/runner/_config.py:8-20
+  - src/python_setup_lint/runner/cmd_build.py:108-124
+  - config/.pylintrc:2,21-27
+  - config/.pylintrc-tests:20
+  - config/rumdl.toml:3
+  - config/pyrightconfig.json:10-20
+  - tests/runner/test_lint_runner_integration.py:52-156,286-307,366-406
+  - tests/runner/test_lint_runner_stats.py:52-132,160-377
+  - tests/runner/test_t3_coverage.py:35-63,282-340
+  - tests/runner/test_baseline_diff.py:28-249
+  - tests/runner/test_baseline_diff_edge.py:25-308
+  - tests/runner/test_baseline_diff_parsers.py:39-486
+  - tests/runner/test_autofix_conflict.py:73-449
+  - tests/runner/test_autofix_conflict_apply.py:29-318
+  - tests/runner/test_autofix_conflict_integration.py:44-399
+  - tests/checkers/test_stub_checker_callable.py:167-265
+  - tests/checkers/test_stub_checker_class.py:48-90
+  - tests/checkers/test_stub_fidelity_invariants.py:323-413
+  - tests/checkers/test_suppression_justification_checker.py:357-390
+  - tests/runner/test_setup_install.py:95-101,263-371
+  - tests/runner/test_setup.py:243-290,326-345
+  - tests/conftest.py:62-89
+  - tests/_project_helpers.py:68-80
+  - tests/integration.py:60-146,223-294,295-329
+recommendations:
+  - "Execute debloat in this order: baseline cluster, autofix cluster,
+    parser/statistics cluster, stub fidelity cluster, setup-install merge,
+    checker helper/parametrize sweep, golden trim, repo-guard removals. Keep
+    tests/integration.py green after each step."
+  - Remove the six definite repo-self/repo-layout guards first
+    (test_self_lint_clean.py, test_pyright_noise_filter.py, TestModuleSizeGates,
+    the tests-AST private-import scan, TestRunLintFixDownstream,
+    TestDownstreamIntegration); rely on `uv run lint`, `uv run lint --fix`, and
+    tests/integration.py.
+  - "Fix test-infrastructure assumptions before merging: replace all
+    `/home/slava/aiexp/python-setup` dev_path values with a repo-root-derived
+    path; replace `Path.home()/'.tmp'` with tmp_path; remove the hardcoded
+    live-pyright checkout test."
+  - Move checker `_make_tc`/`_walk_and_release`/`_msg_ids` into
+    tests/checkers/_factories.py; do NOT create tests/checkers/conftest.py
+    (semantic reservation). Merge `_UvCallRecorder` definitions into one helper.
+  - Split tests/checkers/_factories.py (1,393 lines) and
+    tests/runner/_factories_extras.py (511 lines) to satisfy C0302; remove the
+    duplicate too-many-lines disables in _factories_extras.py:1,6 and the
+    unnecessary disables in test_lint_runner.py:7 and
+    test_lint_runner_integration.py:1.
+  - "Add blocking-debt pinning tests before/during debloat: CLI
+    --force-fix/--cwd/--config-status/--format; config flags mypy/rumdl/ty and
+    pylint-tests/pylint-pyi; scopes ty/src, pylint-pyi/src, pylint-tests/tests,
+    pyright tests/** exclusion; complete 11-label shipped-config discovery;
+    tests/data exclusions; console/python -m entry points."
+  - Keep tests/assumptions as the sole third-party pinning location; rewrite
+    test_stub_checker.py::test_register_function with a real PyLinter or move
+    its contract to tests/assumptions/test_pylint_contracts.py.
+  - "Iteration-3 replan: consume this report plus coding-rules-audit-i2
+    output.yaml:78-95,125; re-glob HEAD (184 universe / 73 tests-minus-data;
+    67/83/15/4/15) before spawning subsystem epics; carry the semantic
+    exclusions and planned-path reservations unchanged."
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/input.md
new file mode 100644
index 0000000..56142a0
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/input.md
@@ -0,0 +1,594 @@
+# Step: Review
+
+## Goal
+Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
+
+## Rules
+- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
+- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
+  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
+  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
+  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
+  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
+- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
+Use ONLY these dispositions; any other disposition value fails validation.
+# Review Suggestion Dispositions
+
+Criteria for assigning disposition to review findings:
+
+| Disposition | When to Assign | Engine Action |
+|---|---|---|
+| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+
+## Assignment
+{
+  "slug": "test-debloat-audit-i2",
+  "kind": "fact-finder",
+  "title": "Inventory redundant tests and pinning limbs",
+  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
+  "outlineRef": "test-debloat-audit",
+  "milestone": "M4",
+  "wave": 4,
+  "deps": [
+    "coding-rules-audit-i2",
+    "consolidate-integration-helpers-i2",
+    "golden-contract-hardening"
+  ],
+  "scenarioRefs": [
+    "M4-2",
+    "M4-3"
+  ],
+  "citations": [
+    "CodingRules.md:230-306",
+    "CodingRules.md:139-159",
+    "AGENTS.md:87-93",
+    "pyproject.toml:49-49",
+    "tests/checkers/test_semantic_check.py:1-7",
+    "tests/checkers/test_semantic_threshold.py:19-25"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md
+new file mode 100644
+index 0000000..53ea966
+--- /dev/null
++++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/input.md
+@@ -0,0 +1,75 @@
++# Step: Research
++
++## Goal
++Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
++
++## Rules
++- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
++- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
++- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
++- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
++- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
++- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
++
++## Assignment
++{
++  "slug": "test-debloat-audit-i2",
++  "kind": "fact-finder",
++  "title": "Inventory redundant tests and pinning limbs",
++  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
++  "outlineRef": "test-debloat-audit",
++  "milestone": "M4",
++  "wave": 4,
++  "deps": [
++    "coding-rules-audit-i2",
++    "consolidate-integration-helpers-i2",
++    "golden-contract-hardening"
++  ],
++  "scenarioRefs": [
++    "M4-2",
++    "M4-3"
++  ],
++  "citations": [
++    "CodingRules.md:230-306",
++    "CodingRules.md:139-159",
++    "AGENTS.md:87-93",
++    "pyproject.toml:49-49",
++    "tests/checkers/test_semantic_check.py:1-7",
++    "tests/checkers/test_semantic_threshold.py:19-25"
++  ]
++}
++
++## Task Intent
++# modernize
++
++Modernize the project while preserving every material lint/check behavior.
++- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
++- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
++- Remove redundant tests.
++- Replace the embedding/rerank based justification/comment check
++  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
++  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
++  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
++
++
++## Context & Citations
++[
++  "CodingRules.md:230-306",
++  "CodingRules.md:139-159",
++  "AGENTS.md:87-93",
++  "pyproject.toml:49-49",
++  "tests/checkers/test_semantic_check.py:1-7",
++  "tests/checkers/test_semantic_threshold.py:19-25"
++]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","inconclusive"])
++- summary (string, required)
++- findings (string, required)
++- contextPack (string, optional)
++- sources (array of string, optional)
++- recommendations (array of string, optional)
+diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..8dc394c
+--- /dev/null
++++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: research
++attempt: 1
++fixRound: 1
++agent: fact-finder
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 900
++status: ok
++startedAt: 2026-11-08T16:22:16.285Z
++session: 01a1bbf7-babc-71d7-a34e-2ce36aa311eb
++endedAt: 2026-11-08T16:36:00.072Z
++usage:
++  inputTokens: 125911
++  outputTokens: 76848
++  costUsd: 0.088857
++traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T16-22-17-020Z_01a1bbf7-babc-71d7-a34e-2ce36aa311eb
+diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+new file mode 100644
+index 0000000..e7bbff9
+--- /dev/null
++++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+@@ -0,0 +1,402 @@
++status: ok
++summary: "Read-only test-debloat audit at HEAD aabf0d8. Re-globbed the 184-file
++  universe and 73 tracked tests-minus-tests/data files; owner counts match
++  coding-rules-audit-i2 exactly (runner 67, checkers 83, setup-testing 15,
++  semantic 4, root 15). Audited 59 test modules (57 dispositioned; 2 semantic
++  whole-file exclusions) plus 14 helper/fixture files. Default suite: 1357
++  passed, 4 skipped, 18 deselected in 30.91s; 18 slow tests are excluded by
++  default; tests/integration.py is an explicit 9-test gate. Found 7
++  duplicate/overlap clusters (baseline diff, parser/statistics, autofix, stub
++  fidelity, setup install, checker helpers, golden helpers), ~1.3-1.8k LoC and
++  ~5-7s default-runtime reduction, 6 definite repo-self/repo-layout test groups
++  for removal, and 15 blocking-debt pinning gaps (CLI
++  force-fix/cwd/config-status/format, config flags/scopes for
++  mypy/rumdl/ty/pylint-tests/pylint-pyi/pyright tests-data, tests-data
++  exclusions). Semantic files/symbol and 6 planned paths are reserved and must
++  not be claimed by this audit."
++findings: |-
++  # Test debloat audit — HEAD aabf0d8
++
++  ## 0. Verification basis
++
++  - HEAD `aabf0d8`; `git status --short` and `git diff --stat` are empty (read-only probes; no repository writes). Product tree is the same tree audited by `coding-rules-audit-i2` at `5e466ac` plus factory wrapper commits.
++  - `uv run pytest -q`: **1357 passed, 4 skipped, 18 deselected, 30.91s**. `uv run pytest -q --collect-only`: 1361/1379 collected. `uv run pytest -q --collect-only -m slow`: **18 slow tests** (excluded by `pyproject.toml:49`).
++  - `uv run pytest tests/integration.py -q`: 9 tests collected; dependency report records **9 passed in 106.61s** (`.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:5-7`); the context pack records ~65s. This module is deliberately not collected by the default `test_*.py` pattern.
++  - Owner-map re-glob: `git ls-files 'src/**' 'scripts/**' 'tests/**' | grep -v '^tests/data/' | wc -l` = **184**; `git ls-files 'tests/**' | grep -v '^tests/data/' | wc -l` = **73**; owner counts = **runner 67, checkers 83, setup-testing 15, semantic 4, root 15** (sum 184, no duplicates). This exactly matches the authoritative map in `.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:78-95,125`.
++  - Test universe: 59 test modules (24 under `tests/checkers/`, 28 under `tests/runner/`, 2 setup-testing modules in `tests/`, 5 root modules incl. `tests/assumptions/`, and the 2 semantic modules counted inside checkers) + 14 helper/fixture files = 73. Test-module LoC = **14,664**; helper/fixture LoC = **3,693**; total 18,357.
++  - All line references below are repository paths; owner values are copied unchanged from the coding-rules map. File ownership is kept separate from symbol-level skips (section 5).
++
++  ## 1. Executive result
++
++  - **7 duplicate/overlap clusters**: baseline diff (4 files), parser/statistics (4 files), autofix conflict (3 files), stub fidelity (3 files), setup install (2 files + conftest), checker helper duplication (13 `_make_tc` / 10 `_walk_and_release` / 8 `_msg_ids` definitions), golden helper tests vs integration.
++  - **Definite repo-self/repo-layout test removals**: `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_setup.py::TestModuleSizeGates`, `test_runner_private_imports.py::test_tests_import_privates_only_from_defining_submodule`, `test_autofix_conflict_integration.py::TestRunLintFixDownstream`, `test_setup_install.py::TestDownstreamIntegration`.
++  - **Optional slow/one-off removals**: `test_bench_runner_overhead.py`, `test_t9_7_compose_pyright_live.py`, `test_extra_tools_downstream.py::test_run_lint_extra_given_startup_then_overhead_within_10_percent`, `test_baseline_diff_edge.py::test_diff_baseline_50k_end_to_end_under_1s`.
++  - **Blocking-debt pinning gaps**: CLI `--force-fix`, `--cwd`, `--config-status`, `--format`; config flags for mypy/rumdl/ty and pylint-tests/pylint-pyi rcfiles; tool scopes for ty/src, pylint-pyi/src, pylint-tests/tests, pyright `tests/**`, mypy `.`, tach whole-repo; complete 11-label shipped-config discovery; tests/data/root-owned exclusions; `PYTHON_SETUP_LINT_FORCE_FIX`; console-script and `python -m` entry points.
++  - **Reserved/excluded**: `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `TestSuppressionRerankerPipeline` (semantic); `tests/checkers/conftest.py`, `tests/assumptions` runtime/decision/cache modules, and the four `_decision_backend`/`_decision_cache` source paths (semantic epic). Do not create or claim these in the debloat work.
++  - **Budget estimate**: ~1,300-1,800 test LoC removed (7-10% of test LoC); default runtime 30.9s -> ~24-26s; slow set reduced by ~8-10 tests. The largest single runtime win is `test_setup_install.py` (6.53s), where six full `install()` runs can become one install plus six assertions.
++
++  ## 2. Per-module inventory and dispositions
++
++  Legend: **K** keep, **M** merge, **R** rewrite (parametrize/trim), **X** remove, **E** excluded. Runtime is measured default runtime from `pytest --durations=0`; `<0.1s` means no test exceeded 5ms. `slow` means excluded by default.
++
++  ### 2.1 Checkers owner (`tests/checkers/**` except the two semantic files)
++
++  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
++  |---|---|---|---|---|---|---|---|---|
++  |`test_asyncio_timeout_checker.py`|await without timeout; outer/inner scope; negatives|—|R|same 4 behavior groups in a parametrize table|124 LoC/15 cases; `_make_tc`/`_walk_and_release` duplicated|checkers|124|<0.1s|
++  |`test_bare_except_comment_checker.py`|W9738 bare/named except without justification; skip comment/reraise/named|partial W9704 heuristic path in suppression tests|R|same 11 detect/skip cases as two tables|175/11; repeated helpers|checkers|175|<0.1s|
++  |`test_beartype_checker.py`|missing `@beartype` public fn; private/decorated skip; source-root filter|—|K|same 16 cases|distinct and already table-driven|checkers|102|<0.1s|
++  |`test_generic_key_dict_checker.py`|`dict[Any, ...]` detection; negatives|—|K|same 18 cases|already parametrized|checkers|116|<0.1s|
++  |`test_missing_error_chain_checker.py`|raise-in-except without `from`; skip chained/bare/outside|—|R|same 12 cases in detect/skip tables|192/12; one class per scenario|checkers|192|<0.1s|
++  |`test_missing_return_annotation_checker.py`|missing return annotation; skips; source-root; mixed|—|R|same 15 cases|169/15; repeated helper defs|checkers|169|<0.1s|
++  |`test_no_try_import_checker.py`|try/except import detection; negatives|—|K|same 14 cases|already table-driven|checkers|51|<0.1s|
++  |`test_pyi_underscore_checker.py`|private symbols in `.pyi`; public/dunder/type-checking guards|—|R|same 9 cases as one table|121/9; one method per input shape|checkers|121|<0.1s|
++  |`test_redundant_type_guard_checker.py`|redundant isinstance guard; skip cases/class scope|—|R|same 18 cases|240/18; four scenario classes|checkers|240|<0.1s|
++  |`test_semantic_check.py`|semantic import fallback; default-user/reranker fallback; heuristic patterns; threshold/reranker pairs|`test_semantic_threshold.py`; heuristic pattern tests|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|506|82 default + 3 slow|
++  |`test_semantic_threshold.py`|30 meaningful + 50 meaningless comment threshold|`test_semantic_check.py` heuristic patterns|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|135|80|
++  |`test_silent_except_checker.py`|silent except detection; skip raise/logging|—|R|same 14 cases|221/14; four scenario classes|checkers|221|<0.1s|
++  |`test_structlog_checker.py`|`logging.getLogger`/printf/fstring detection; skips|—|R|same 14 cases|141/14; many one-line methods|checkers|141|<0.1s|
++  |`test_stub_checker.py`|checker name/messages/register/state/coverage/import contract/var fidelity/pipeline|partial stub fidelity integration cases|K/R|same 54; move `register_checker` mock contract to assumptions|456/54; one third-party mock assertion at `:100-106`|checkers|456|<0.1s|
++  |`test_stub_checker_callable.py`|param descriptors; compare callable/annotations/returns; ctx; subprocess integration|`test_stub_fidelity_invariants.py:323-413` pure helpers/ctx|K, trim subprocess to 1-2 rows|callable unit matrix + one subprocess smoke|276/36; 1.09s from 2 subprocess rows|checkers|276|1.09s|
++  |`test_stub_checker_class.py`|class bases/methods/attrs/ClassVar; E97B1/E97B2; subprocess integration|`test_stub_fidelity_invariants.py:369-383` pure helpers|K, trim subprocess to 1-2 rows|class unit matrix + one subprocess smoke|155/27; 3.04s from 5 subprocess rows|checkers|155|3.04s|
++  |`test_stub_coverage.py`|coverage helpers; path/test/opt-out/init/trivial/main/source-root; emit violations|—|K|same 57 cases|param tables already centralized|checkers|191|0.02s|
++  |`test_stub_docstring_checker.py`|docstring location and `Returns:` rules|—|K|same 28 cases|distinct|checkers|145|<0.1s|
++  |`test_stub_fidelity_invariants.py`|E97B1-4/W97B5 message-level invariants; pure helpers; ctx; orchestrator|callable/class unit matrices; ctx tests|M|keep invariant scenario classes + orchestrator; remove `TestComparePureHelpersDirect`/`TestCtxConstruction`/`TestPublicSymbolSurface`|428/35; ~135 duplicate LoC|checkers|428|<0.1s|
++  |`test_stub_normalizer.py`|AnnotationNormalizer infer/AST walk/rewrites|—|K|same 18 cases|already parametrized|checkers|91|<0.1s|
++  |`test_suppression_justification_checker.py`|W9704 justified/unjustified; data strings; Any params/returns; reranker pipeline|semantic heuristic tests (excluded)|K/R|same 40 default cases; 2 slow reranker cases stay semantic-owned|390/40; `TestSuppressionRerankerPipeline` is a semantic symbol skip|checkers (file) / semantic (symbol)|390|0.01s + 2 slow|
++  |`test_tmp_path_checker.py`|tempfile in tests; skips; file patterns/imports|—|R|same 27 cases|219/27; seven scenario classes|checkers|219|0.04s|
++  |`test_trivial_wrapper_checker.py`|trivial wrapper detection; skip overload/abstract/self/recursive/signature|—|R|same 19 cases|259/19; nine scenario classes|checkers|259|0.27s|
++  |`test_unnamed_tuple_dict_checker.py`|unnamed tuple/dict values detection; negatives|—|K|same 11 cases|already table-driven|checkers|99|<0.1s|
++
++  ### 2.2 Runner owner (`tests/runner/**` except `test_setup*.py`)
++
++  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
++  |---|---|---|---|---|---|---|---|---|
++  |`test_autofix_conflict.py`|git changed-file snapshots; E999 parse; target paths; env opt-out; observability; Windows paths|`test_autofix_conflict_apply.py` branch matrix|K/M|same unit classes; absorb apply matrix|449/25; three-file split|runner|449|0.18s|
++  |`test_autofix_conflict_apply.py`|`_apply_autofix_conflict_aware` no-conflict/staged/unstaged/skip/E999/no-E999/untracked|`test_autofix_conflict.py`; `test_autofix_conflict_integration.py`|M|merge branch rows into `test_autofix_conflict.py`|318/8; duplicates real-git cases at `:291-399`|runner|318|0.17s|
++  |`test_autofix_conflict_integration.py`|run-lint fix dispatch; precommit template; real-git staged/E999|apply fake branches; repo self-lint|K/X|keep `TestRunLintFixDispatch`, `TestPrecommitTemplateHasFix`, `TestAutofixRealGitIntegration`; remove `TestRunLintFixDownstream`|399/12; repo downstream test at `:44-112`|runner|399|1.02s + 1 slow|
++  |`test_baseline_diff.py`|`_compare_sorted`; none-position; drift-resistant diff; perf|`test_baseline_diff_edge.py`, `test_baseline_diff_parsers.py`, integration baseline matrix|M|target consolidated baseline module: compare-sorted + drift-resistant|249/15; split baseline surface|runner|249|<0.1s|
++  |`test_baseline_diff_edge.py`|mixed schema; error paths; peek/fallback; dedup; legacy shape; capture-on-disk; 50k perf|`test_baseline_diff.py`, `test_baseline_diff_parsers.py`|M|keep mixed-schema/error/peek/dedup/capture; keep one 50k perf row|308/16; perf `:75-132`|runner|308|<0.1s + 2 slow|
++  |`test_baseline_diff_parsers.py`|45 record-parser rows; capture schema; capture edge; compare-sorted edge; parser edge|`test_baseline_diff.py`; `test_t3_coverage.py` parser edge|K/M|keep `TestRecordParsers`; move capture/compare rows to baseline module|486/45; parser table is the pinning limb|runner|486|<0.1s|
++  |`test_bench_runner_overhead.py`|per-tool time/RSS benchmark; runner overhead threshold|`test_real_pipeline_smoke.py` (pipeline), `test_extra_tools_downstream.py` perf|X (optional)|no behavior contract; `uv run lint` statistics/time output|241/2 slow; one-off G-5 evidence|runner|241|slow|
++  |`test_config_consistency.py`|pylintrc DESIGN/STUB-CHECKER/SIMILARITIES consistency|—|K|same 11 cases|config contract; keep|runner|86|<0.1s|
++  |`test_extra_tools.py`|extra-tool load/validate/merge/build/statistics/strategy fallback|`test_extra_tools_downstream.py` downstream|K|same 44 cases|unit contract|runner|346|<0.1s|
++  |`test_extra_tools_downstream.py`|extra downstream pipeline; statistics surface; startup overhead|`test_extra_tools.py`; bench|K/X|keep `TestRunLintExtraDownstreamIntegration` + statistics; remove startup-overhead perf row|209/4 (1 slow); perf `:112-209`|runner|209|<0.1s + 1 slow|
++  |`test_lint_runner.py`|ToolSpec; register identity; build command/strategies; path helpers; detect-secrets bootstrap; tach config; pylintrc; observability; print/result; pyright summary|`test_runner_format_contract.py` (registry), `test_lint_runner_stats.py` (registry)|K|same 58 cases; remove unnecessary `too-many-lines` disable at `:7`|479/58; file is under 500 LoC|runner|479|0.20s|
++  |`test_lint_runner_integration.py`|capture baseline; diff matrix; edge/path errors; overwrite; orchestration; main argparse/exit; run_lint integration; run_cmd|`test_baseline_diff*.py`; `tests/integration.py`|K/M|keep CLI/exit/run_lint/run_cmd; move baseline matrix to baseline module; remove unnecessary disable at `:1`|418/40; baseline section `:52-156`|runner|418|1.19s + 1 slow|
++  |`test_lint_runner_stats.py`|statistics flags/parsers; sort/group; malformed pyproject; registry/register/generic/fallback; invalid group|`test_t3_coverage.py` parser completeness; `test_lint_runner.py` registry|K/M|keep statistics/group/fail-fast; merge registry semantics with `test_lint_runner.py`; absorb t3|380/87; duplicate completeness at `:72-77`|runner|380|<0.1s|
++  |`test_parsers_hypothesis.py`|property invariants for record/statistics parsers (never-raise, sort, idempotence, empty/garbage)|explicit parser edge tests|K|same 66 property cases|CodingRules `hypothesis` requirement; keep|runner|432|2.95s|
++  |`test_pyright_noise_filter.py`|repo-root pyright verify-types noise filter; bypass bite|`test_lint_runner.py:438-479`|X|unit filter tests already pin summary extraction|113/2 slow; repo self-lint|runner|113|slow|
++  |`test_real_pipeline_smoke.py`|full 14-tool pipeline on synthetic project; all sections present|`tests/integration.py` full pipeline|K|same one default smoke|42/1; 4.17s but sole default full-pipeline smoke|runner|42|4.17s|
++  |`test_runner_format_contract.py`|ruff format check vs mutate; config discovery/flag; registry constants; pipeline modes; golden counts|`test_lint_runner.py::TestToolSpec`; `test_lint_runner_stats.py::TestLintToolRegistry`|K|same 12 cases; this is the 14-tool/ruff-format pinning limb|157/12|runner|157|0.02s|
++  |`test_runner_private_imports.py`|runner `__all__`/namespace no private; init no private submodule; tests import privates only from defining module|—|K/X|keep first 3 API-surface tests; remove repo-wide test scan|95/4; scan at `:59-95`|runner|95|0.12s|
++  |`test_self_lint_clean.py`|full repo self-lint exit 0/no crash/no skip/score 10|`uv run lint` gate|X|`uv run lint` (not pytest)|59/1 slow; policy says pytest never asserts repo passes lint|runner|59|slow|
++  |`test_setup.py`|setup helpers/state/update/CLI/templates/config drift/module-size gates|`test_setup_install.py` install artifacts; conftest|K/R|keep setup state/update/templates/config drift; remove `TestModuleSizeGates`; merge install CLI with install module|385/51; module-size gates `:326-345`; hardcoded dev_path `:252,277`|setup-testing|385|2.89s|
++  |`test_setup_install.py`|fresh install artifacts; idempotency; existing precommit; missing pyproject; step errors; downstream|`test_setup.py::TestMainCLI`; conftest `configured_project`; `tests/integration.py`|M/R|one install + six artifact assertions; merge two idempotency tests; fix dev_path; remove/rewrite downstream|371/21; six installs in `:263-266`; downstream `:310-371`|setup-testing|371|6.53s + 1 slow|
++  |`test_t11_health_checks.py`|test_checked_main argv; precommit config validators; installed-template validation|`test_setup_precommit.py` (different layer)|K|same 16 cases|keep; slow real-subprocess case is marked slow|runner|383|0.02s + 1 slow|
++  |`test_t1b_self_discovery.py`|`_default_config_paths`; `_infer_package_name`; yamllint/ruff config flag|`test_runner_format_contract.py` config discovery|K|same 13 cases; extend to all 11 labels|169/13; partial shipped-label coverage|runner|169|<0.1s|
++  |`test_t3_coverage.py`|parser completeness; parser edge cases; aggregate statistics; statistics observability; print-table edges|`test_lint_runner_stats.py` parser completeness/statistics|M|merge statistics/observability into stats module; remove duplicate completeness rows|390/33; duplicate `:35-45`|runner|390|<0.1s|
++  |`test_t5_compose_ruff.py`|RunnerConfig override fields; compose ruff no-override/with-overrides; pyproject cache; run_lint consumption|`test_t9_7_compose_pyright.py` pattern only|K|same 21 cases|ruff config compose pinning limb|runner|366|0.01s|
++  |`test_t9_7_compose_pyright.py`|compose pyright no-rewrite/copy-to-cwd; run_lint consumption|`test_t9_7_compose_pyright_live.py`|K|same 15 cases|pyright config compose pinning limb|runner|281|<0.1s|
++  |`test_t9_7_compose_pyright_live.py`|live pyright `.venv` collapse; hardcoded external checkout|`test_t9_7_compose_pyright.py`|X|unit compose + `test_real_pipeline_smoke.py`|197/2 slow; environment-specific `:31`|runner|197|slow|
++  |`test_testing_fakes.py`|`make_lint_result`; fake run_cmd dispatch; test helper contracts|—|K|same 19 cases|product `testing.py` behavior|runner|197|0.03s|
++
++  ### 2.3 Setup-testing owner (additional modules outside `tests/runner`)
++
++  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
++  |---|---|---|---|---|---|---|---|---|
++  |`tests/test_setup_config_symlinks.py`|symlink create/skip/fallback/copy; fake package; real bundled configs|`test_setup_install.py` config-copy artifacts (partial)|K|same 7 cases|distinct symlink contract|setup-testing|162|<0.1s|
++  |`tests/test_setup_precommit.py`|ruff version resolution/v-prefix/fallback/existing-config/template format|`test_t11_health_checks.py` precommit validators (different layer)|K|same 7 cases|distinct `_setup_precommit` contract|setup-testing|176|<0.1s|
++  |`tests/runner/test_setup.py`|see 2.2|—|K/R|see 2.2|see 2.2|setup-testing|385|2.89s|
++  |`tests/runner/test_setup_install.py`|see 2.2|—|M/R|see 2.2|see 2.2|setup-testing|371|6.53s|
++
++  ### 2.4 Root owner (`tests/` root + `tests/assumptions/**`)
++
++  |Module|Behaviors|Duplicate-of|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
++  |---|---|---|---|---|---|---|---|---|
++  |`tests/integration.py`|golden pipeline; config overlay; resetup idempotency; dry-run hooks; clean consumer; pre-commit; baseline paths; per-tool parity; rumdl rules|`test_golden.py` helper tests; `test_real_pipeline_smoke.py`|K|9 end-to-end scenarios; golden multiset + oracle + tool counts|behavior-preservation safety net; explicit 9-test gate|root|498|~65-107s explicit|
++  |`tests/test_golden.py`|finding key/normalize/serialize/collect/assert/update guard/oracle/tool coverage/slice|`tests/integration.py`|R/trim|keep failure-path/update-guard/oracle/tool-coverage tests; remove serialization roundtrip duplicates|414/31; helper internals|root|414|<0.1s|
++  |`tests/assumptions/test_astroid_contracts.py`|astroid stream/doc_node/nodes_of_class/span|—|K|4 contracts|sole third-party pinning location|root|153|0.08s|
++  |`tests/assumptions/test_beartype_contracts.py`|beartype TYPE_CHECKING-only forward-ref behavior|—|K|1 contract|sole third-party pinning location|root|65|<0.1s|
++  |`tests/assumptions/test_pylint_contracts.py`|PyLinter register/check lifecycle; CheckerTestCase capture; MessageDefinitionTuple|—|K|3 contracts|sole third-party pinning location|root|175|<0.1s|
++  |`tests/conftest.py`|session PATH; `empty_project`; `configured_project`; `tmp_baseline`; `runner_config_factory`; `isolated_runner_registries`; `sample_project`|—|K/R|same fixtures; fix hardcoded `dev_path`|163; hardcoded path `:86`|root|163|fixtures|
++  |`tests/_golden.py`|golden helpers|—|K|same|test infrastructure|root|446|infra|
++  |`tests/_project_helpers.py`|shared project/git/config helpers|—|K|same|already consolidated by M2|root|204|infra|
++
++  ### 2.5 Semantic exclusions
++
++  |Module/symbol|Behaviors|Disp|Surviving coverage|Reason|Owner|LoC|Runtime|
++  |---|---|---|---|---|---|---|---|
++  |`tests/checkers/test_semantic_check.py`|import/default-user/reranker fallbacks; heuristic patterns; threshold; reranker pairs|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|506|82 default + 3 slow|
++  |`tests/checkers/test_semantic_threshold.py`|30 meaningful + 50 meaningless threshold rows|E|semantic epic owns; keep pending rewrite|whole-file exclusion|semantic|135|80|
++  |`TestSuppressionRerankerPipeline` (`tests/checkers/test_suppression_justification_checker.py:357-390`)|two slow reranker comments|E|semantic symbol owner|symbol exclusion inside a checkers-owned file|semantic|34-class|2 slow|
++
++  ## 3. Duplicate clusters and merge plan
++
++  ### 3.1 Baseline diff cluster (4 files)
++
++  Evidence: `test_baseline_diff.py:28-249` (`TestCompareSorted`, `TestDriftResistantDiff`), `test_baseline_diff_edge.py:25-308` (`TestMixedSchemaLoad`, `TestPerfBenchmark`, `TestDiffBaselineErrors`, `TestPeekFallbackTools`, `TestFallbackTracking`, `TestMultiSavedToolDedup`, `TestMixedShapeLegacyOutput`, `TestCaptureBaselineOnDisk`), `test_baseline_diff_parsers.py:39-486` (`TestRecordParsers`, `TestCaptureSchemaV2`, `TestCaptureOneEdgeCases`, `TestCompareSortedEdgeCases`, `TestParserEdgeCases`), and `test_lint_runner_integration.py:52-156` (`TestCaptureBaseline`, `test_diff_baseline_matrix`, `TestDiffBaselineEdgeCases`).
++
++  Merge target: **`test_baseline_diff.py`** for capture/compare/diff/overwrite/error/mixed-schema; **`test_baseline_diff_parsers.py`** for the 45-row record-parser table and parser edge cases. Move `DIFF_BASELINE_CASES`/`DIFF_EDGE_CASES`/`DIFF_EDGE_INVARIANTS` consumption out of `test_lint_runner_integration.py`; leave CLI/exit/run_lint there. Remove `test_diff_baseline_50k_end_to_end_under_1s` (duplicate perf; keep `test_50k_line_baseline_compares_under_200ms`). Estimated -250 to -350 LoC; no default runtime change.
++
++  ### 3.2 Parser/statistics cluster (4 files)
++
++  Evidence: `test_lint_runner_stats.py:66-79` (`test_statistics_parser`, `test_statistics_parsers_given_all_tools_then_covered`), `test_t3_coverage.py:35-63` (`TestParserCompleteness`), `test_t3_coverage.py:67-216` (`TestParserEdgeCases`), `test_t3_coverage.py:222-390` (aggregate/observability/print-table), `test_parsers_hypothesis.py:90-432` (property invariants), `test_baseline_diff_parsers.py:39-217` (record parsers).
++
++  Exact duplicate: `test_t3_coverage.py:35-45` asserts `TOOLS - FORMATTER_ONLY - STATISTICS_PARSER_TOOLS == empty`; `test_lint_runner_stats.py:72-77` already asserts `STATISTICS_PARSER_TOOLS == frozenset(_STATISTICS_PARSERS)` and `{t.name for t in TOOLS} - FORMATTER_ONLY == statistics_tools`, which implies the same and more. Remove the two t3 completeness rows; keep the third flags-alignment row only if it is not subsumed by `STATISTICS_FLAG_CASES` (`_factories_tables.py:139-157`). Merge t3 statistics observability/print-table into `test_lint_runner_stats.py`. Keep `test_parsers_hypothesis.py` as the property layer and `test_baseline_diff_parsers.py` as the record-parser table. Estimated -80 to -120 LoC.
++
++  ### 3.3 Autofix conflict cluster (3 files)
++
++  Evidence: `test_autofix_conflict.py:73-449` (git changed files, E999 parse, target paths, env opt-out, observability, canary label, Windows paths), `test_autofix_conflict_apply.py:29-318` (no-conflict/staged-only/unstaged-only/staged+unstaged/E999/no-E999/no-modification/untracked), `test_autofix_conflict_integration.py:44-399` (run-lint fix dispatch, precommit template, real git).
++
++  Duplicate behavior: apply `:120-147` (staged+unstaged skipped) vs integration `:291-336` (real git same file skipped); apply `:148-205` (E999 revert) vs integration `:372-399` (real git E999 revert); apply no-conflict/staged-only/unstaged-only vs real-git rows. Merge `_apply_autofix_conflict_aware` branch matrix into `test_autofix_conflict.py`; keep `test_autofix_conflict_integration.py` for **real git** + precommit template + fix dispatch, but reduce real-git rows to the two branch-complete cases. Remove `TestRunLintFixDownstream` (`:44-112`, repo self-lint). Estimated -200 to -280 LoC; ~-0.2s default.
++
++  ### 3.4 Stub fidelity cluster (3 files)
++
++  Evidence: `test_stub_checker_callable.py:167-265` (compare descriptors/annotations/returns, ctx), `test_stub_checker_class.py:48-90` (normalize bases, public method, ctx), `test_stub_fidelity_invariants.py:323-413` (`TestComparePureHelpersDirect`, `TestCtxConstruction`). The invariants file's pure-helper tests are strict subsets: e.g. `test_compare_callable_descriptors_given_identical/count_mismatch` vs callable `:167-189`; `test_compare_callable_annotations_*` vs `:191-214`; `test_compare_return_annotations_*` vs `:216-243`; `test_normalize_bases_*`/`test_is_public_method_*` vs class `:48-72`; `TestCtxConstruction` vs callable `:245-265` and class `:74-90`. Keep the parametrized unit matrices and subprocess smoke; remove the duplicate pure-helper/ctx/public-surface classes from `test_stub_fidelity_invariants.py`. Estimated -135 LoC; ~-2s default by reducing subprocess rows in `test_stub_checker_class.py`/`_callable.py`.
++
++  ### 3.5 Setup install cluster (2 files + conftest)
++
++  Evidence: `test_setup_install.py:95-101` defines six `INSTALL_ARTIFACT_CASES`; `:263-266` runs a full `install()` for each parameter (measured 6.53s for 21 collected tests); `:272-278` has two idempotency tests (`test_second_install_skips_dep`, `test_install_given_second_install_then_no_dup`); `test_setup.py:243-290` tests `main(["install", ...])`; `tests/conftest.py:62-89` runs a session-scoped install. Merge the six artifact checks into one install + six assertions; merge the two idempotency tests; reuse `configured_project`; replace hardcoded `dev_path="/home/slava/aiexp/python-setup"` with a repo-root-derived path. Estimated -50 LoC and ~-4s default.
++
++  ### 3.6 Checker helper duplication
++
++  Evidence: `_make_tc` defined in 13 checker test modules (e.g. `test_bare_except_comment_checker.py:16-17`, `test_missing_error_chain_checker.py:16-17`, `test_silent_except_checker.py:16-17`, `test_tmp_path_checker.py:19-20`, `test_trivial_wrapper_checker.py:18-19`); `_walk_and_release` in 10 modules (e.g. `test_beartype_checker.py:31-37`, `test_missing_return_annotation_checker.py:25-32`, `test_structlog_checker.py:23-35`, `test_stub_docstring_checker.py:33-39`); `_msg_ids` in 8 modules (e.g. `test_redundant_type_guard_checker.py:27-28`, `test_silent_except_checker.py:31-32`, `test_suppression_justification_checker.py:19-20`). Move one `make_tc`/`walk_and_release`/`msg_ids` into `tests/checkers/_factories.py` (checkers-owned) and import them. Do **not** create `tests/checkers/conftest.py`; it is reserved for the semantic epic. Estimated -100 to -130 LoC.
++
++  ### 3.7 Golden helper tests vs integration
++
++  Evidence: `test_golden.py:61-414` has 31 helper-internal tests; `integration.py:60-146` exercises the same helpers end-to-end (golden multiset, oracle, tool coverage, byte-identical replay). Keep failure-path/update-guard tests (`:243-334`), oracle/tool coverage (`:359-401`), and slice tests (`:403-414`); remove serialization roundtrip duplicates (`:152-215`) that are already pinned by integration's byte-identical replay. Estimated -80 to -120 LoC.
++
++  ## 4. Pinning-limb inventory
++
++  ### 4.1 CLI and exit
++
++  |Limb|Material behavior|Surviving pinning test|Status|
++  |---|---|---|---|
++  |`main()` argparse flags `--path/--fix/--exclude/--package-name/--tools/--default-py-dirs`|acceptance and forwarding|`tests/runner/test_lint_runner_integration.py:286-293` (`test_main_argparse_given_flag_then_accepts`) + `tests/runner/_factories_tables.py:148-173`|pinned|
++  |`--help` / unknown flag exit|exit 0 / nonzero|`tests/runner/test_lint_runner_integration.py:296-307` (`TestMainCLI::test_main_exit_codes`) + `tests/runner/_factories_extras.py:502-505`|pinned|
++  |`--baseline` create/diff|baseline lifecycle|`tests/runner/test_lint_runner_integration.py:158-232` (`TestOverwriteBaseline`) and `:342-380`|pinned|
++  |`--overwrite-baseline`|rewrite existing baseline|`tests/runner/test_lint_runner_integration.py:158-232`; `tests/integration.py:295-329`|pinned|
++  |`run_lint` nonzero on new violation|exit contract|`tests/runner/test_lint_runner_integration.py:366-380`|pinned|
++  |`_run_cmd` exit 127/124|subprocess exit mapping|`tests/runner/test_lint_runner_integration.py:395-406`|pinned|
++  |`--group` / `--sort-by-rule`|statistics grouping|`tests/runner/test_lint_runner_stats.py:117-132`|pinned|
++  |`--statistics` / `--format` at run_lint level|JSON/table output|`tests/runner/test_t3_coverage.py:282-340`|pinned at API level|
++  |`--force-fix`|force autofix / skip staged+unstaged exclusion|none|**blocking debt** (only `src/python_setup_lint/runner/cli.py:292-300,390-397`)|
++  |`--cwd`|working-directory override|none|**blocking debt** (`cli.py:329-334`)|
++  |`--config-status`|print config origins and early-return|none|**blocking debt** (`cli.py:345-349,383-386`)|
++  |`--format table/json` via CLI|CLI wiring|none (API-level only)|**blocking debt** (`cli.py:317-323`)|
++  |`PYTHON_SETUP_LINT_FORCE_FIX` env|force-fix parity with CLI|none|**blocking debt** (`cli.py:390`)|
++  |console scripts `lint`/`install`/`python-setup`/`python-setup-test-checked`|entry-point wiring|none|**blocking debt** (`pyproject.toml:22-26`)|
++  |`python -m python_setup_lint`|module entry point|none|**blocking debt** (`src/python_setup_lint/__main__.py:1-5`)|
++  |setup CLI `install`/`update`/bad subcommand|setup CLI exit behavior|`tests/runner/test_setup.py:243-290`|pinned but hardcoded `dev_path` at `:252,277`|
++
++  ### 4.2 Baseline and autofix
++
++  |Limb|Material behavior|Surviving pinning test|Status|
++  |---|---|---|---|
++  |baseline capture|serialize tool output to records|`tests/runner/test_lint_runner_integration.py:52-78`; `test_baseline_diff_parsers.py:218-362`|pinned|
++  |baseline diff matrix|added/removed/multiset/reorder|`tests/runner/test_lint_runner_integration.py:79-101`; `test_baseline_diff.py:135-249`|pinned; move matrix to baseline module|
++  |baseline edge/path errors|missing/invalid/empty baseline|`tests/runner/test_lint_runner_integration.py:103-156`; `test_baseline_diff_edge.py:113-227`|pinned|
++  |baseline schema/mixed legacy|legacy upgrade/shrink|`test_baseline_diff_edge.py:25-73,228-308`|pinned|
++  |baseline parsers|45 per-tool record rows|`test_baseline_diff_parsers.py:39-217`|pinned (pinning limb)|
++  |baseline perf|50k compare/diff thresholds|`test_baseline_diff_edge.py:75-132`|pinned slow; remove one duplicate row|
++  |autofix conflict branch matrix|no-conflict/staged/unstaged/skip|`test_autofix_conflict_apply.py:29-147`; `test_autofix_conflict.py:73-122`|pinned; merge apply into conflict|
++  |E999 canary|revert broken parse|`test_autofix_conflict_apply.py:148-249`; `test_autofix_conflict_integration.py:372-399`|pinned (fake + real git)|
++  |untracked in-memory revert|no git checkout|`test_autofix_conflict_apply.py:285-318`|pinned|
++  |autofix observability|skip/revert stderr format|`test_autofix_conflict.py:303-357`|pinned|
++  |`PYTHON_SETUP_LINT_NO_AUTOFIX`|env opt-out|`test_autofix_conflict.py:226-301`|pinned|
++  |real git staging|staged/unstaged separation|`test_autofix_conflict.py:73-122`; `test_autofix_conflict_integration.py:269-399`|pinned|
++  |precommit `lint --fix` hook|template shape/args|`test_autofix_conflict_integration.py:114-187`; `tests/integration.py:249-294`|pinned; end-to-end hook dry-run in integration|
++  |fix dispatch|`run_lint(fix=True)` route|`test_autofix_conflict_integration.py:189-267`|pinned|
++  |repo downstream `uv run lint --fix`|repo self-lint completion|`test_autofix_conflict_integration.py:44-112`|**blocking/remove**: rewrite synthetic or rely on `uv run lint --fix`|
++  |`PYTHON_SETUP_LINT_FORCE_FIX`|force-fix env|none|**blocking debt**|
++
++  ### 4.3 Configs and scopes
++
++  |Limb|Material behavior|Surviving pinning test|Status|
++  |---|---|---|---|
++  |shipped config discovery|all 11 `_SHIPPED_CONFIG_FILES` labels|`tests/runner/test_t1b_self_discovery.py:36-80` (7 labels); `test_runner_format_contract.py:69-72` (ruff format); `test_lint_runner.py:123-171` (pylint)|partial; **blocking debt** for mypy/ty/rumdl/tach/pylint-tests/pylint-pyi labels|
++  |`_config_flag_for` mapping|ruff/yamllint/pyright/ruff-format|`test_t1b_self_discovery.py:154-169`; `test_runner_format_contract.py:74-77`; `test_t5_compose_ruff.py:335-345`; `test_t9_7_compose_pyright.py:208-237`|partial; **blocking debt** for mypy/rumdl/ty/pylint-tests/pylint-pyi (`cmd_build.py:111-123`)|
++  |`ruff format` check vs mutate|normal pass `--check`; fix phase mutates|`test_runner_format_contract.py:43-63,130-149`|pinned (pinning limb)|
++  |`ruff format` config flag|shipped ruff config in both modes|`test_runner_format_contract.py:66-77`|pinned|
++  |ruff config compose|banned-api/per-file-ignores/temp path|`test_t5_compose_ruff.py:88-218,274-355`|pinned|
++  |pyright config compose|no-rewrite/copy-to-cwd/read-only fallback|`test_t9_7_compose_pyright.py:66-281`|pinned|
++  |pylint rcfile discovery/complexity|config/.pylintrc precedence; no max-complexity|`test_lint_runner.py:107-186,332-345`; `test_config_consistency.py:23-85`|pinned|
++  |pylint tests/pyi rcfile discovery|`.pylintrc-tests` / `.pylintrc-pyi`|none|**blocking debt** (`dispatch.py:342-410`)|
++  |yamllint/rumdl default paths|`.` scope|`test_lint_runner.py:64-72`|pinned|
++  |tach config|tach.toml source roots|`test_lint_runner.py:309-330`|partial (file existence, not whole-repo scope)|
++  |detect-secrets baseline bootstrap|missing baseline → scan; existing → hook|`test_lint_runner.py:266-307`|pinned|
++  |extra-tools config|load/validate/merge/flag|`test_extra_tools.py:58-346`|pinned|
++  |14-tool registry|single-source names/formatter/parser partitions|`test_runner_format_contract.py:80-108,152-157`|pinned|
++  |tool scopes|ty src-only, pylint-pyi src, pylint tests tests, pyright tests/** exclusion, mypy `.`, tach whole repo|none direct|**blocking debt** (`dispatch.py:74-137`; `config/pyrightconfig.json:10-20`)|
++  |tests/data/root-owned exclusions|rumdl `tests/data`; pyright `tests/**`|none; `_project_helpers.py:68-80` only strips the rumdl exclude for the sample project|**blocking debt** (`config/rumdl.toml:3`; `config/pyrightconfig.json:10-20`)|
++  |tests/data golden counts|14 tool-count keys|`test_runner_format_contract.py:152-157`; `tests/integration.py:60-146`|pinned|
++
++  ## 5. Symbol exclusions (file ownership kept separate)
++
++  |Symbol/file|Defining evidence|Owner|Audit treatment|
++  |---|---|---|---|
++  |`tests/checkers/test_semantic_check.py` whole file|`tests/checkers/test_semantic_check.py:1-506`|semantic|excluded; keep pending semantic rewrite; its `TestBrushOffPatterns`/`TestMeaningfulPatterns` overlap `test_semantic_threshold.py` — handoff note only, no debloat disposition|
++  |`tests/checkers/test_semantic_threshold.py` whole file|`tests/checkers/test_semantic_threshold.py:1-135`|semantic|excluded; keep pending semantic rewrite|
++  |`TestSuppressionRerankerPipeline`|`tests/checkers/test_suppression_justification_checker.py:357-390`|semantic|symbol skip; the file remains checkers-owned, but do not edit this class|
++  |`check_if_meaningful`|`src/python_setup_lint/checkers/_base.py:143-238`; `_base.pyi:69-96`|semantic|not audited; checkers owner must not refactor|
++  |`_OPTIONAL_IMPORT_PATTERNS`|`src/python_setup_lint/checkers/conformance/no_try_import_checker.py:12`|semantic|not audited; must track new optional model dependency|
++  |`_semantic.py` / `_semantic.pyi`|`src/python_setup_lint/checkers/_semantic.py:1-189`; `_semantic.pyi:1-42`|semantic|whole-file exclusion|
++
++  ## 6. Planned-path reservations
++
++  |Path/glob|Owner|Status at HEAD|Evidence|
++  |---|---|---|---|
++  |`tests/checkers/conftest.py`|semantic epic|**absent**|`plan-1.2.yaml:116-125,316-317` (epic-created; do not create in debloat)|
++  |`tests/assumptions/test_*runtime*.py`|semantic epic|**absent**|`plan-1.2.yaml:316-317` (epic-created runtime-assumption modules)|
++  |`tests/assumptions/test_*decision*.py`, `test_*cache*.py`|semantic epic|**absent**|same reservation; no matching tracked file|
++  |`src/python_setup_lint/checkers/_decision_backend.py` / `.pyi`|semantic|**absent**|coding-rules map `output.yaml:78-95` (planned-path reservations)|
++  |`src/python_setup_lint/checkers/_decision_cache.py` / `.pyi`|semantic|**absent**|same map|
++  |Proposed (not reserved): `tests/checkers/_factories_stub.py`, `_factories_conformance.py`|checkers|new split targets for the 1,393-line `_factories.py`|this audit; no conflict with reserved paths|
++  |Proposed (not reserved): `tests/runner/_factories_extras_*.py`|runner|split target for 511-line `_factories_extras.py`|this audit; no conflict|
++
++  `tests/conftest.py`, `tests/_golden.py`, and `tests/_project_helpers.py` are root-owned and **not** reserved; the root owner may fix the hardcoded `dev_path` in `conftest.py:86`.
++
++  ## 7. Repo-self-lint / repo-layout tests recommended for removal
++
++  |Test|Evidence|Why remove|Surviving gate|
++  |---|---|---|---|
++  |`test_self_lint_clean.py::test_self_lint_clean`|`tests/runner/test_self_lint_clean.py:20-59`|runs full repo lint and asserts exit 0/score 10; policy: pytest never asserts this repo passes lint|`uv run lint` (AGENTS.md:9)|
++  |`test_pyright_noise_filter.py::test_pyright_noise_filter` + `..._bites_when_bypassed`|`tests/runner/test_pyright_noise_filter.py:20-113`|runs `run_lint` against repo root; duplicates unit filter coverage|`tests/runner/test_lint_runner.py:438-479` (`TestSummarizePyrightVerifyTypes`)|
++  |`test_setup.py::TestModuleSizeGates`|`tests/runner/test_setup.py:326-345`|asserts repo module LoC/pyi shape; C0302 lint already enforces|`config/.pylintrc:2`, `config/.pylintrc-tests:20`|
++  |`test_runner_private_imports.py::test_tests_import_privates_only_from_defining_submodule`|`tests/runner/test_runner_private_imports.py:59-95`|scans repo test AST; not product behavior|keep API tests `:26-57`; tach/pylint for policy|
++  |`test_autofix_conflict_integration.py::TestRunLintFixDownstream`|`tests/runner/test_autofix_conflict_integration.py:44-112`|runs `run_lint(fix=True)` on this repo; slow, self-lint-ish|synthetic fix tests + `uv run lint --fix`|
++  |`test_setup_install.py::TestDownstreamIntegration`|`tests/runner/test_setup_install.py:310-371`|writes `~/.tmp/t15-downstream` and runs install+lint; integration.py already covers install-then-lint|`tests/integration.py:223-248`|
++  |`test_t9_7_compose_pyright_live.py` (2 tests)|`tests/runner/test_t9_7_compose_pyright_live.py:29-197`|hardcoded `/home/slava/aiexp/python-setup`; live pyright; duplicate of compose unit|`tests/runner/test_t9_7_compose_pyright.py:66-281`|
++  |`test_bench_runner_overhead.py` (2 slow)|`tests/runner/test_bench_runner_overhead.py:119-241`|one-off G-5 benchmark; no behavior contract|`uv run lint` timing/statistics; optional keep-slow|
++  |`test_extra_tools_downstream.py::test_run_lint_extra_given_startup_then_overhead_within_10_percent`|`tests/runner/test_extra_tools_downstream.py:112-209`|perf threshold; not behavior|keep correctness downstream tests `:37-110`|
++  |`test_baseline_diff_edge.py::test_diff_baseline_50k_end_to_end_under_1s`|`tests/runner/test_baseline_diff_edge.py:91-132`|duplicate perf path; compare-sorted perf row remains|`test_50k_line_baseline_compares_under_200ms` `:76-90`|
++
++  ## 8. Test-infrastructure debt (fix before/with debloat)
++
++  1. **Hardcoded workstation path**: `tests/conftest.py:86` and setup tests use `dev_path="/home/slava/aiexp/python-setup"` (`tests/runner/test_setup.py:252,277`; `tests/runner/test_setup_install.py:265,274,284,288,350`; `tests/runner/test_autofix_conflict_integration.py:181`; live pyright `test_t9_7_compose_pyright_live.py:31`). `tests/integration.py:234,262` correctly uses `Path.cwd()`; use that pattern or a repo-root fixture. This is an assumption/test-infra defect, not a product behavior.
++  2. **Write outside `tmp_path`**: `tests/runner/test_setup_install.py:318` uses `Path.home() / ".tmp" / "t15-downstream"`; replace with `tmp_path` or remove with the downstream test.
++  3. **Duplicate helper definitions**: `_make_tc` x13, `_walk_and_release` x10, `_msg_ids` x8, `_UvCallRecorder` x2 (`tests/runner/test_setup.py:39-60`, `test_setup_install.py:36-58`). Move checker helpers to `tests/checkers/_factories.py`; setup recorder to one module or `tests/_project_helpers.py` (root-owned; coordinate).
++  4. **C0302 disables in test code**: `tests/checkers/_factories.py:15` (1,393 lines), `tests/runner/_factories_extras.py:1,6` (511 lines; duplicate disable), `tests/runner/test_lint_runner.py:7` (479 lines; disable unnecessary), `tests/runner/test_lint_runner_integration.py:1` (418 lines; unnecessary), `tests/checkers/test_semantic_check.py:1` (506 lines; semantic-owned). Split `_factories.py` and `_factories_extras.py`; remove unnecessary disables.
++  5. **Third-party contract outside assumptions**: `tests/checkers/test_stub_checker.py:100-106` mocks `linter` and asserts `register_checker` call shape. Plan M2 says `tests/assumptions` is the only third-party pinning location. Rewrite with a real `PyLinter`/`CheckerTestCase`, or move the contract to `tests/assumptions/test_pylint_contracts.py` (root-owned).
++  6. **Marker mismatch**: `tests/runner/test_t11_health_checks.py:37` marks the whole module `no_external_api`, but `:369-383` invokes real `pre-commit validate-config` (slow). Keep the slow marker; either split the module marker or document the exception.
++  7. **Stale docs/counts**: `AGENTS.md:10` says 1290 pass/4 skip/15 deselected; measured at HEAD is 1357/4/18. Root-owned docs update; not a test debloat item.
++
++  ## 9. Runtime and LoC budget
++
++  - Current: 14,664 test-module LoC + 3,693 helper LoC; default suite 30.91s; 18 slow tests excluded; integration 9 tests ~65-107s explicit.
++  - Conservative reduction: **-1,300 to -1,800 LoC** (baseline cluster -300, autofix -250, stub fidelity -135, checker helpers/parametrization -400 to -600, setup -50, golden -100, repo guards -500 if all optional removals land).
++  - Runtime: `test_setup_install.py` 6.53s -> ~2.5-3s (one install); stub subprocess rows ~4.1s -> ~2s; autofix ~-0.2s; repo-self removals save slow time only (default unaffected). Expected default **~24-26s**.
++  - Keep the high-value default gates: `test_real_pipeline_smoke.py` (4.17s, sole default full-pipeline smoke), `test_parsers_hypothesis.py` (2.95s, property layer), `test_lint_runner.py` (0.20s), `test_runner_format_contract.py` (0.02s), and `tests/integration.py` (golden safety net).
++
++  ## 10. Iteration-3 replan handoff
++
++  - Consume both reports: this audit + `coding-rules-audit-i2` (`output.yaml:78-95,125`). Owner map is authoritative and must not be reassigned by the test audit.
++  - Re-glob validation command and expected values:
++    - `git ls-files 'src/**' 'scripts/**' 'tests/**' | grep -v '^tests/data/' | wc -l` -> **184**.
++    - `git ls-files 'tests/**' | grep -v '^tests/data/' | wc -l` -> **73**.
++    - owner counts -> **runner 67, checkers 83, setup-testing 15, semantic 4, root 15**.
++    - `Path.exists()` is false for `tests/checkers/conftest.py`, the `tests/assumptions` runtime/decision/cache globs, and the four `_decision_backend`/`_decision_cache` paths.
++  - Re-glob catches epic-created modules before spawning subsystem epics; any new test module created by the semantic epic must be appended to the semantic owner or root-owned group, not to checkers/runner.
++  - Exclusions to carry into replan: two semantic test files, `TestSuppressionRerankerPipeline`, `check_if_meaningful`, `_OPTIONAL_IMPORT_PATTERNS`, `_semantic.py/.pyi`, `tests/checkers/conftest.py`, and the runtime/decision/cache assumption modules.
++
++  ## 11. Verification checklist against the assignment
++
++  - [x] Every test module has a disposition with surviving coverage (59 modules; 57 audited + 2 semantic exclusions).
++  - [x] Repo-self-lint / repo-layout tests are listed for removal with replacement gates (section 7).
++  - [x] Each material limb names a pinning test or a blocking-debt flag (sections 4.1-4.3).
++  - [x] Owners match the unified map: runner 67, checkers 83, setup-testing 15, semantic 4, root 15; tests-minus-data 73; universe 184.
++  - [x] File ownership is separate from symbol skips: `test_suppression_justification_checker.py` stays checkers-owned while `TestSuppressionRerankerPipeline` is semantic-owned.
++  - [x] Planned-path reservations are listed and verified absent (section 6).
++  - [x] HEAD re-glob validation is reproducible (section 10).
++contextPack: "HEAD aabf0d8 (product tree same as coding-rules-audit-i2 HEAD
++  5e466ac plus factory wrapper commits); `git status` clean; no repo writes.
++  Default suite 1357 passed/4 skipped/18 deselected/30.91s; 18 slow tests
++  excluded; tests/integration.py is an explicit 9-test gate (~65-107s). Test
++  universe 59 modules + 14 helpers = 73 tracked tests-minus-data files; 18,357
++  LoC (14,664 test + 3,693 helpers). Owner map re-globbed exactly: 184 universe
++  files, runner 67, checkers 83, setup-testing 15, semantic 4, root 15.
++  Authoritative map:
++  .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1\
++  /output.yaml:78-95,125. Reserved/absent: tests/checkers/conftest.py,
++  tests/assumptions runtime/decision/cache modules,
++  src/python_setup_lint/checkers/_decision_backend.py(.pyi),
++  _decision_cache.py(.pyi). Excluded: test_semantic_check.py,
++  test_semantic_threshold.py, TestSuppressionRerankerPipeline,
++  check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py/.pyi. Debloat
++  targets: baseline cluster (-250/-350 LoC), autofix cluster (-200/-280), stub
++  fidelity (-135), checker helpers/parametrization (-400/-600), setup install
++  (-50 LoC, -4s), golden trim (-100), repo-self/repo-layout removals (-500
++  optional). Blocking debt: CLI --force-fix/--cwd/--config-status/--format,
++  PYTHON_SETUP_LINT_FORCE_FIX, config flags/scopes for
++  mypy/rumdl/ty/pylint-tests/pylint-pyi, pyright tests/** exclusion, complete
++  11-label config discovery, tests/data exclusions, console/python -m entry
++  points. Replan must re-glob HEAD and consume both reports."
++sources:
++  - .factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:78-95,125
++  - .factory/tasks/modernize/items/coding-rules-audit-i2/steps/002-review-r1-a1/input.md:258-305
++  - .factory/tasks/modernize/plan/plan-1.2.yaml:116-125,316-317,455-466
++  - .factory/tasks/modernize/plan/edits-2.0.yaml:399-400
++  - CodingRules.md:139-159,230-306
++  - AGENTS.md:9-11,87-93
++  - pyproject.toml:22-26,49-55
++  - src/python_setup_lint/runner/cli.py:274-413
++  - src/python_setup_lint/runner/dispatch.py:46-137,294-410
++  - src/python_setup_lint/runner/_config.py:8-20
++  - src/python_setup_lint/runner/cmd_build.py:108-124
++  - config/.pylintrc:2,21-27
++  - config/.pylintrc-tests:20
++  - config/rumdl.toml:3
++  - config/pyrightconfig.json:10-20
++  - tests/runner/test_lint_runner_integration.py:52-156,286-307,366-406
++  - tests/runner/test_lint_runner_stats.py:52-132,160-377
++  - tests/runner/test_t3_coverage.py:35-63,282-340
++  - tests/runner/test_baseline_diff.py:28-249
++  - tests/runner/test_baseline_diff_edge.py:25-308
++  - tests/runner/test_baseline_diff_parsers.py:39-486
++  - tests/runner/test_autofix_conflict.py:73-449
++  - tests/runner/test_autofix_conflict_apply.py:29-318
++  - tests/runner/test_autofix_conflict_integration.py:44-399
++  - tests/checkers/test_stub_checker_callable.py:167-265
++  - tests/checkers/test_stub_checker_class.py:48-90
++  - tests/checkers/test_stub_fidelity_invariants.py:323-413
++  - tests/checkers/test_suppression_justification_checker.py:357-390
++  - tests/runner/test_setup_install.py:95-101,263-371
++  - tests/runner/test_setup.py:243-290,326-345
++  - tests/conftest.py:62-89
++  - tests/_project_helpers.py:68-80
++  - tests/integration.py:60-146,223-294,295-329
++recommendations:
++  - "Execute debloat in this order: baseline cluster, autofix cluster,
++    parser/statistics cluster, stub fidelity cluster, setup-install merge,
++    checker helper/parametrize sweep, golden trim, repo-guard removals. Keep
++    tests/integration.py green after each step."
++  - Remove the six definite repo-self/repo-layout guards first
++    (test_self_lint_clean.py, test_pyright_noise_filter.py, TestModuleSizeGates,
++    the tests-AST private-import scan, TestRunLintFixDownstream,
++    TestDownstreamIntegration); rely on `uv run lint`, `uv run lint --fix`, and
++    tests/integration.py.
++  - "Fix test-infrastructure assumptions before merging: replace all
++    `/home/slava/aiexp/python-setup` dev_path values with a repo-root-derived
++    path; replace `Path.home()/'.tmp'` with tmp_path; remove the hardcoded
++    live-pyright checkout test."
++  - Move checker `_make_tc`/`_walk_and_release`/`_msg_ids` into
++    tests/checkers/_factories.py; do NOT create tests/checkers/conftest.py
++    (semantic reservation). Merge `_UvCallRecorder` definitions into one helper.
++  - Split tests/checkers/_factories.py (1,393 lines) and
++    tests/runner/_factories_extras.py (511 lines) to satisfy C0302; remove the
++    duplicate too-many-lines disables in _factories_extras.py:1,6 and the
++    unnecessary disables in test_lint_runner.py:7 and
++    test_lint_runner_integration.py:1.
++  - "Add blocking-debt pinning tests before/during debloat: CLI
++    --force-fix/--cwd/--config-status/--format; config flags mypy/rumdl/ty and
++    pylint-tests/pylint-pyi; scopes ty/src, pylint-pyi/src, pylint-tests/tests,
++    pyright tests/** exclusion; complete 11-label shipped-config discovery;
++    tests/data exclusions; console/python -m entry points."
++  - Keep tests/assumptions as the sole third-party pinning location; rewrite
++    test_stub_checker.py::test_register_function with a real PyLinter or move
++    its contract to tests/assumptions/test_pylint_contracts.py.
++  - "Iteration-3 replan: consume this report plus coding-rules-audit-i2
++    output.yaml:78-95,125; re-glob HEAD (184 universe / 73 tests-minus-data;
++    67/83/15/4/15) before spawning subsystem epics; carry the semantic
++    exclusions and planned-path reservations unchanged."
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
+  - summary (string, required)
+  - detail (string, optional)
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..e9c326d
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: review
+attempt: 1
+fixRound: 1
+agent: reviewer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T16:36:03.054Z
+session: 01a1bc04-5752-775d-bbc4-7a06d360e5e0
+endedAt: 2026-11-08T16:52:16.236Z
+usage:
+  inputTokens: 53205
+  outputTokens: 31075
+  costUsd: 0.013006
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T16-36-03-538Z_01a1bc04-5752-775d-bbc4-7a06d360e5e0.jsonl
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/output.yaml
new file mode 100644
index 0000000..88d80e5
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/002-review-r1-a1/output.yaml
@@ -0,0 +1,72 @@
+status: changes_requested
+summary: Audit verified on universe/owners/pins (184/73, 1361/18/9, helper
+  counts, CLI/scope gaps) but has 4 factual/coverage defects needing correction.
+suggestions:
+  - id: bench-slow-count
+    disposition: fix
+    summary: test_bench_runner_overhead.py has 1 slow test, not 2
+    detail: File defines a single test at
+      tests/runner/test_bench_runner_overhead.py:119; collect-only shows 1
+      deselected and the -m slow list has 1 bench entry. Report rows claim
+      '241/2 slow' and '(2 slow)'. Correct both rows and the slow-reduction
+      budget (total 18 stays correct).
+    location:
+      file: .factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+      line: 81
+  - id: stub-surface-lock-not-duplicate
+    disposition: fix
+    summary: TestPublicSymbolSurface is a unique surface lock, do not remove as
+      duplicate
+    detail: TestPublicSymbolSurface
+      (tests/checkers/test_stub_fidelity_invariants.py:277-322) hasattr-loops 19
+      re-exported fidelity names; grep confirms it is the sole surface-lock test
+      and other stub tests import only subsets. Removing it loses the
+      re-export/split-preservation contract with no named survivor. Keep it or
+      prove the import union covers all 19 names and name the surviving pin.
+    location:
+      file: .factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+      line: 64
+  - id: golden-canonical-not-pinned-by-replay
+    disposition: fix
+    summary: Serialization canonical/empty properties are not pinned by integration
+      replay
+    detail: tests/test_golden.py:152-215 asserts canonical format (sorted,
+      sort_keys, indent=2, trailing newline), empty-input arrays, and
+      tool-minimum mapping order. tests/integration.py:115-122 byte-identical
+      replay proves determinism on one non-empty real finding set, not
+      unsorted/empty/mapping-order properties. Narrow the removal to truly
+      redundant rows or keep the canonical/empty pins with surviving coverage.
+    location:
+      file: .factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+      line: 168
+  - id: semantic-pyi-range
+    disposition: fix
+    summary: _semantic.pyi citation 1-42 is wrong; file is 27 lines
+    detail: wc -l src/python_setup_lint/checkers/_semantic.pyi = 27, so '1-42' in
+      the exclusion table is impossible. Correct to 1-27 (whole-file exclusion
+      intent unchanged).
+    location:
+      file: .factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+      line: 244
+  - id: loc-methodology
+    disposition: optional
+    summary: Clarify LoC counting method; wc -l differs slightly
+    detail: "Report claims 14,664 test + 3,693 helper LoC; wc -l gives 14,650 (58
+      test_*.py + integration.py) and 3,716 (14 helpers). Gap is immaterial to
+      the 1.3-1.8k budget but state the counter (wc vs parser, trailing newline,
+      integration inclusion) for replan reproducibility. Uncertainty: runtime
+      figures (e.g. 6.53s vs 9.69s observed for test_setup_install) are
+      environment-sensitive; note measurement conditions."
+    location:
+      file: .factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml
+      line: 26
+  - id: case-count-default-vs-total
+    disposition: optional
+    summary: Clarify whether per-module N is default-collected or total incl slow
+    detail: "Rows like test_extra_tools_downstream '209/4 (1 slow)' are ambiguous:
+      default collect shows 4 while the slow list adds 1 (total 5?). State once
+      that N = default-collected unless noted, so replan does not miscount
+      slow-inclusive totals."
+    location:
+      file: tests/runner/test_extra_tools_downstream.py
+      line: 37
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/input.md b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/input.md
new file mode 100644
index 0000000..8924002
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/input.md
@@ -0,0 +1,82 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
+
+## Assignment
+{
+  "slug": "test-debloat-audit-i2",
+  "kind": "fact-finder",
+  "title": "Inventory redundant tests and pinning limbs",
+  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
+  "outlineRef": "test-debloat-audit",
+  "milestone": "M4",
+  "wave": 4,
+  "deps": [
+    "coding-rules-audit-i2",
+    "consolidate-integration-helpers-i2",
+    "golden-contract-hardening"
+  ],
+  "scenarioRefs": [
+    "M4-2",
+    "M4-3"
+  ],
+  "citations": [
+    "CodingRules.md:230-306",
+    "CodingRules.md:139-159",
+    "AGENTS.md:87-93",
+    "pyproject.toml:49-49",
+    "tests/checkers/test_semantic_check.py:1-7",
+    "tests/checkers/test_semantic_threshold.py:19-25"
+  ]
+}
+
+## Task Intent
+# modernize
+
+Modernize the project while preserving every material lint/check behavior.
+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
+- Remove redundant tests.
+- Replace the embedding/rerank based justification/comment check
+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
+
+
+## Context & Citations
+[
+  "CodingRules.md:230-306",
+  "CodingRules.md:139-159",
+  "AGENTS.md:87-93",
+  "pyproject.toml:49-49",
+  "tests/checkers/test_semantic_check.py:1-7",
+  "tests/checkers/test_semantic_threshold.py:19-25"
+]
+
+## Review Feedback
+- [FIX] test_bench_runner_overhead.py has 1 slow test, not 2: File defines a single test at tests/runner/test_bench_runner_overhead.py:119; collect-only shows 1 deselected and the -m slow list has 1 bench entry. Report rows claim '241/2 slow' and '(2 slow)'. Correct both rows and the slow-reduction budget (total 18 stays correct). (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
+- [FIX] TestPublicSymbolSurface is a unique surface lock, do not remove as duplicate: TestPublicSymbolSurface (tests/checkers/test_stub_fidelity_invariants.py:277-322) hasattr-loops 19 re-exported fidelity names; grep confirms it is the sole surface-lock test and other stub tests import only subsets. Removing it loses the re-export/split-preservation contract with no named survivor. Keep it or prove the import union covers all 19 names and name the surviving pin. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
+- [FIX] Serialization canonical/empty properties are not pinned by integration replay: tests/test_golden.py:152-215 asserts canonical format (sorted, sort_keys, indent=2, trailing newline), empty-input arrays, and tool-minimum mapping order. tests/integration.py:115-122 byte-identical replay proves determinism on one non-empty real finding set, not unsorted/empty/mapping-order properties. Narrow the removal to truly redundant rows or keep the canonical/empty pins with surviving coverage. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
+- [FIX] _semantic.pyi citation 1-42 is wrong; file is 27 lines: wc -l src/python_setup_lint/checkers/_semantic.pyi = 27, so '1-42' in the exclusion table is impossible. Correct to 1-27 (whole-file exclusion intent unchanged). (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
+
+- [OPTIONAL] Clarify LoC counting method; wc -l differs slightly: Report claims 14,664 test + 3,693 helper LoC; wc -l gives 14,650 (58 test_*.py + integration.py) and 3,716 (14 helpers). Gap is immaterial to the 1.3-1.8k budget but state the counter (wc vs parser, trailing newline, integration inclusion) for replan reproducibility. Uncertainty: runtime figures (e.g. 6.53s vs 9.69s observed for test_setup_install) are environment-sensitive; note measurement conditions.
+- [OPTIONAL] Clarify whether per-module N is default-collected or total incl slow: Rows like test_extra_tools_downstream '209/4 (1 slow)' are ambiguous: default collect shows 4 while the slow list adds 1 (total 5?). State once that N = default-collected unless noted, so replan does not miscount slow-inclusive totals.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/meta.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/meta.yaml
new file mode 100644
index 0000000..67bd4e2
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
+name: research
+attempt: 1
+fixRound: 2
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T16:52:18.440Z
+session: 01a1bc13-38e3-77fb-b609-e406fd1835e2
+endedAt: 2026-11-08T17:06:20.564Z
+usage:
+  inputTokens: 44626
+  outputTokens: 29029
+  costUsd: 0.025062
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T16-52-18-787Z_01a1bc13-38e3-77fb-b609-e406fd1835e2.jsonl
diff --git a/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml
new file mode 100644
index 0000000..844ac00
--- /dev/null
+++ b/.factory/tasks/modernize/items/test-debloat-audit-i2/steps/003-research-r2-a1/output.yaml
@@ -0,0 +1,729 @@
+status: ok
+summary: "Corrected the four review-flagged findings and re-verified them
+  against HEAD: (1) tests/runner/test_bench_runner_overhead.py holds exactly 1
+  test, marked slow (line 118-119) — 241 LoC, 0 default-collected, 1 slow; (2)
+  TestPublicSymbolSurface is a unique 19-name re-export surface lock and stays
+  KEEP, not remove; (3) tests/test_golden.py:152-198
+  canonical/empty/mapping-order pins are unique and stay KEEP —
+  integration.py:115-122 only proves determinism on one non-empty finding set;
+  (4) src/python_setup_lint/checkers/_semantic.pyi is 27 lines, so the
+  whole-file symbol exclusion is 1-27. Also documented the counting method (wc
+  -l: 14,650 test LoC over 58 test_*.py + tests/integration.py; 3,707 non-data
+  helper LoC over 13 files, or 3,716 including the 9-line tests/data fixture),
+  the N convention (N = default-collected because pyproject.toml:49 sets -m 'not
+  slow'; slow reported separately), and runtime measurement conditions (WSL2
+  x64, Python 3.14.4, uv venv, warm caches: 1357 passed + 4 skipped + 18
+  deselected in 24.33s; test_self_lint_clean measured 154.32s and FAILED on HEAD
+  with exit 123; test_bench_runner_overhead 8.36s). Slow budget: 18 on HEAD, 16
+  after removing bench+self-lint, 14 after dropping the two slow perf
+  benchmarks."
+findings: >-
+  # Test debloat audit — iteration 2 (corrected, fix round r2)
+
+
+  Scope: all files under `tests/` **except** `tests/data/**` (root-owned
+  fixtures; no dispositions, no edits). Read-only audit; no repository files
+  were written.
+
+
+  ## 0. Fix-round corrections (review r1)
+
+
+  | # | Review concern | Correction | Evidence (HEAD) |
+
+  |---|---|---|---|
+
+  | 1 | Bench row claimed 241 LoC / 2 slow | **241 LoC, 0 default-collected, 1
+  slow.** The file defines exactly one test function, decorated
+  `@pytest.mark.slow`; `--collect-only` reports `no tests collected (1
+  deselected)`. Slow-reduction budget recomputed below. |
+  `tests/runner/test_bench_runner_overhead.py:118-119`; `uv run pytest
+  tests/runner/test_bench_runner_overhead.py --collect-only -q` -> "no tests
+  collected (1 deselected)" |
+
+  | 2 | TestPublicSymbolSurface must not be removed as a duplicate | **KEEP.**
+  It is the sole surface lock for 19 re-exported `stub_fidelity` names; no other
+  test imports the full set (`grep -rn "stub_fidelity" tests` finds only this
+  file; the other stub tests import individual symbols). Removing it loses the
+  re-export/split-preservation contract with no named survivor. |
+  `tests/checkers/test_stub_fidelity_invariants.py:277-322` (19-name loop at
+  287-307) |
+
+  | 3 | Golden canonical/empty pins are not covered by integration replay |
+  **KEEP all of `tests/test_golden.py:152-198`.** The canonical tests pin
+  unsorted->sorted row order, `json.dumps(indent=2, sort_keys=True)`, exactly
+  one trailing newline, key order, empty arrays, and tool-minimum mapping
+  order/zero-fill. `tests/integration.py:115-122` replays one non-empty real
+  finding set and only proves byte-identical determinism. No removal in this
+  family; module disposition is KEEP (all 30 tests). |
+  `tests/test_golden.py:152-198`; `tests/integration.py:120-122`; only other
+  `serialize_*` call sites are inside `tests/_golden.py:398,406` (determinism
+  helper) |
+
+  | 4 | `_semantic.pyi` exclusion citation 1-42 is impossible | **Corrected to
+  `src/python_setup_lint/checkers/_semantic.pyi:1-27`** (whole file; `wc -l` =
+  27). Exclusion intent unchanged. | `wc -l
+  src/python_setup_lint/checkers/_semantic.pyi` = 27 |
+
+  | OPT 1 | LoC counter unclear; wc differs | Counting method stated in section
+  1. `wc -l` on 58 `test_*.py` + `tests/integration.py` (tests/data excluded) =
+  **14,650**. Helper set: **3,707** over 13 non-data `.py` files (incl. 4
+  `__init__.py`); the reviewer's **3,716 / 14 files** includes
+  `tests/data/minimal_sample_project/tests/test_tempfile.py` (9 lines), a
+  fixture file. The 9-line gap is immaterial to the 1.3-1.8k budget. | `find
+  tests -name 'test_*.py' ... | xargs wc -l`; `find tests -name '*.py' -not
+  -name 'test_*.py' ...` |
+
+  | OPT 2 | Is N default-collected or slow-inclusive? | **N =
+  default-collected.** `pyproject.toml:49-55` sets `addopts = "-m 'not slow'"`;
+  slow markers are listed separately as `+S slow`. Suite totals on HEAD: **1379
+  collected = 1357 default-collected (+4 skipped) + 18 slow-deselected**.
+  Slow-inclusive totals are N+S and are never implied by N. |
+  `pyproject.toml:49-55`; `uv run pytest tests --collect-only -q` -> 1361/1379
+  (18 deselected); `-m slow` -> 18/1379 |
+
+
+  ### Runtime measurement conditions (fixes OPT-1 note)
+
+  - WSL2 x64, Python 3.14.4, `uv run pytest -q -p no:tach -p no:cacheprovider`,
+  warm venv/tool caches, sequential execution. Full default suite: **1357
+  passed, 4 skipped, 18 deselected in 24.33s** (AGENTS.md quotes ~53s;
+  machine/load sensitive). Subprocess-heavy figures vary run-to-run (e.g.
+  `tests/runner/test_setup_install.py` measured **5.72s** here vs 6.53s/9.69s
+  observed earlier) — treat as +/-30% and environment-sensitive.
+  `test_self_lint_clean` measured **154.32s** (full 14-tool lint) and
+  `test_bench_runner_overhead` **8.36s** on the same run.
+
+
+  ## 1. Conventions
+
+  - **LoC** = `wc -l` per file (trailing newline counted; `tests/data/**`
+  excluded).
+
+  - **N** = tests collected under the default addopts (`-m 'not slow'`); `+S` =
+  tests excluded by the slow marker (direct decorator or module `pytestmark`).
+
+  - **Dispositions**: `keep` (unique coverage, no change), `merge` (tests folded
+  into the named survivor; retired file LoC is a candidate reduction but test
+  intent survives), `rewrite` (drop env-sensitive perf/benchmark assertions,
+  keep functional pins), `remove` (no unique product-behavior coverage),
+  `exclude-symbol` (owned by the semantic decision-model epic; do not
+  edit/remove here).
+
+  - **Owner tokens** are the subsystem owners used for the coding-rules-audit
+  unified map: `tests-infra`, `checkers`, `semantic`, `runner`, `baseline`,
+  `autofix`, `configs`, `setup`, `golden`, `integration`. File ownership is
+  separate from symbol skips: the semantic **symbols** remain owned by
+  `semantic` even where a file/class is excluded from this audit.
+
+  - Repo-self-lint tests (tests asserting python-setup's own lint state rather
+  than shipped product behavior) are listed for removal:
+  `tests/runner/test_self_lint_clean.py`.
+
+
+  ## 2. Per-module inventory (59 files; 14,650 LoC; 1379 collected)
+
+
+  | # | Module | LoC | N+S slow | Behaviors | Duplicate-of | Disposition |
+  Surviving coverage | Reason | Owner | Runtime |
+
+  |---|---|---|---|---|---|---|---|---|---|
+
+  | 1 | `tests/assumptions/test_astroid_contracts.py` | 153 | 4 | 0 | astroid
+  API contracts checkers rely on | — | keep | itself | third-party drift pin
+  (assumption-first) | tests-infra | 0.09s |
+
+  | 2 | `tests/assumptions/test_beartype_contracts.py` | 65 | 1 | 0 | beartype
+  TYPE_CHECKING forward refs | — | keep | itself | drift pin | tests-infra |
+  <=0.05s |
+
+  | 3 | `tests/assumptions/test_pylint_contracts.py` | 175 | 3 | 0 | pylint
+  behaviors checkers rely on | — | keep | itself | drift pin | tests-infra |
+  <=0.1s |
+
+  | 4 | `tests/checkers/test_asyncio_timeout_checker.py` | 124 | 4 | 0 | asyncio
+  timeout checker unit | — | keep | itself | unique checker | checkers | <=0.1s
+  |
+
+  | 5 | `tests/checkers/test_bare_except_comment_checker.py` | 175 | 11 | 0 |
+  bare-except comment checker | — | keep | itself | unique checker | checkers |
+  <=0.1s |
+
+  | 6 | `tests/checkers/test_beartype_checker.py` | 102 | 5 | 0 | beartype
+  checker | — | keep | itself | unique checker | checkers | <=0.1s |
+
+  | 7 | `tests/checkers/test_generic_key_dict_checker.py` | 116 | 2 | 0 |
+  generic key dict checker | — | keep | itself | unique checker | checkers |
+  <=0.1s |
+
+  | 8 | `tests/checkers/test_missing_error_chain_checker.py` | 192 | 12 | 0 |
+  missing error chain checker | — | keep | itself | unique checker | checkers |
+  <=0.1s |
+
+  | 9 | `tests/checkers/test_missing_return_annotation_checker.py` | 169 | 4 | 0
+  | missing return annotation checker | — | keep | itself | unique checker |
+  checkers | <=0.1s |
+
+  | 10 | `tests/checkers/test_no_try_import_checker.py` | 51 | 2 | 0 |
+  no-try-import checker | — | keep | itself | unique checker | checkers |
+  <=0.05s |
+
+  | 11 | `tests/checkers/test_pyi_underscore_checker.py` | 121 | 9 | 0 | pyi
+  underscore conformance checker | — | keep | itself | unique checker | checkers
+  | <=0.1s |
+
+  | 12 | `tests/checkers/test_redundant_type_guard_checker.py` | 240 | 18 | 0 |
+  redundant type-guard checker | — | keep | itself | unique checker | checkers |
+  <=0.2s |
+
+  | 13 | `tests/checkers/test_semantic_check.py` | 506 | 19 | 3 | `_semantic`
+  heuristic/reranker paths | — | exclude-symbol | decision-model epic
+  (`_decision*`) | semantic rewrite in flight; tests must not be edited/removed
+  here | semantic | ~2-5s |
+
+  | 14 | `tests/checkers/test_semantic_threshold.py` | 135 | 2 | 0 |
+  `check_if_meaningful` heuristic threshold | — | exclude-symbol |
+  decision-model epic | threshold semantics move to the replacement model |
+  semantic | <=0.5s |
+
+  | 15 | `tests/checkers/test_silent_except_checker.py` | 221 | 14 | 0 |
+  silent-except checker | — | keep | itself | unique checker | checkers | <=0.1s
+  |
+
+  | 16 | `tests/checkers/test_structlog_checker.py` | 141 | 14 | 0 | structlog
+  checker | — | keep | itself | unique checker | checkers | <=0.1s |
+
+  | 17 | `tests/checkers/test_stub_checker.py` | 456 | 23 | 0 | stub checker
+  core, message codes, pipeline | merge target for #23 | keep | itself + merged
+  `AnnotationNormalizer` tests | core stub behavior | checkers | <=0.5s |
+
+  | 18 | `tests/checkers/test_stub_checker_callable.py` | 276 | 12 | 0 |
+  callable fidelity (Invariant 3) | `test_stub_fidelity_invariants.py` | merge |
+  `test_stub_fidelity_invariants.py` (invariant-3 home) | same domain; duplicate
+  `ParamDescriptor` cases at :83/:96 vs :310 | checkers | 1.05s |
+
+  | 19 | `tests/checkers/test_stub_checker_class.py` | 155 | 9 | 0 | class
+  fidelity + E97B1/E97B2 dispatch | `test_stub_fidelity_invariants.py` | merge |
+  `test_stub_fidelity_invariants.py` | same invariant-3 domain; avoids a third
+  stub file | checkers | 2.82s |
+
+  | 20 | `tests/checkers/test_stub_coverage.py` | 191 | 11 | 0 | stub-coverage
+  helpers | — | keep | itself | distinct helper module | checkers | 0.04s |
+
+  | 21 | `tests/checkers/test_stub_docstring_checker.py` | 145 | 8 | 0 | stub
+  docstring checker | — | keep | itself | unique checker | checkers | <=0.1s |
+
+  | 22 | `tests/checkers/test_stub_fidelity_invariants.py` | 428 | 35 | 0 |
+  invariant fixtures + public surface lock | — | keep (merge target) | itself |
+  unique surface lock (fix 2); absorbs #18/#19 | checkers | <=0.5s |
+
+  | 23 | `tests/checkers/test_stub_normalizer.py` | 91 | 4 | 0 |
+  `AnnotationNormalizer` | `test_stub_checker.py:414-422` | merge |
+  `test_stub_checker.py` | duplicate normalizer coverage | checkers | <=0.1s |
+
+  | 24 | `tests/checkers/test_suppression_justification_checker.py` | 390 | 42 |
+  1 | W9704 suppression justification | — | keep (minus reranker class) |
+  `:1-356` + non-reranker tests | `TestSuppressionRerankerPipeline` is
+  symbol-excluded (`:357-390`) | semantic | ~1-2s |
+
+  | 25 | `tests/checkers/test_tmp_path_checker.py` | 219 | 27 | 0 | tmp-path
+  checker | — | keep | itself | unique checker | checkers | <=0.2s |
+
+  | 26 | `tests/checkers/test_trivial_wrapper_checker.py` | 259 | 19 | 0 |
+  trivial-wrapper checker | — | keep | itself | unique checker | checkers |
+  0.26s |
+
+  | 27 | `tests/checkers/test_unnamed_tuple_dict_checker.py` | 99 | 2 | 0 |
+  unnamed tuple/dict checker | — | keep | itself | unique checker | checkers |
+  <=0.05s |
+
+  | 28 | `tests/integration.py` | 498 | 9 | 0 | end-to-end
+  install/lint/update/golden | — | keep | itself | fit-for-purpose gate; golden
+  replay only determinism (fix 3) | integration | ~10-20s |
+
+  | 29 | `tests/runner/test_autofix_conflict.py` | 449 | 20 | 0 | conflict-aware
+  autofix helpers/observability/opt-out | — | keep | itself | autofix limb pin |
+  autofix | 0.16s |
+
+  | 30 | `tests/runner/test_autofix_conflict_apply.py` | 318 | 8 | 0 |
+  `_apply_autofix_conflict_aware` branches | — | keep | itself | autofix limb
+  pin | autofix | 0.15s |
+
+  | 31 | `tests/runner/test_autofix_conflict_integration.py` | 399 | 13 | 1 |
+  `--fix` route + pre-commit template | — | keep | itself | autofix limb pin |
+  autofix | 1.11s |
+
+  | 32 | `tests/runner/test_baseline_diff.py` | 249 | 3 | 0 | drift-resistant
+  baseline diff | — | keep | itself | baseline limb pin | baseline | <=0.1s |
+
+  | 33 | `tests/runner/test_baseline_diff_edge.py` | 308 | 12 | 1 | baseline
+  edge cases + perf benchmark | — | rewrite | functional tests `:25-73`,
+  `:113-312` | drop slow perf class `:74-110` (env-sensitive 200ms/1s ceilings)
+  | baseline | <=0.5s |
+
+  | 34 | `tests/runner/test_baseline_diff_parsers.py` | 486 | 6 | 0 |
+  parser/capture matrix + schema v2 | — | keep | itself | parser limb pin |
+  baseline | <=0.5s |
+
+  | 35 | `tests/runner/test_bench_runner_overhead.py` | 241 | 0 | 1 | benchmark:
+  per-tool time/RSS + runner overhead artifact | — | remove | none required (no
+  assertions; artifact only) | **241 LoC / 1 slow / 8.36s**, writes markdown but
+  asserts nothing (fix 1) | runner | 8.36s measured |
+
+  | 36 | `tests/runner/test_config_consistency.py` | 86 | 9 | 0 | shipped
+  pylintrc single-source consistency | — | keep | itself | config surface
+  invariant | configs | <=0.1s |
+
+  | 37 | `tests/runner/test_extra_tools.py` | 346 | 21 | 0 | extra-tool
+  parse/validation (R4) | — | keep | itself | config surface | configs | <=0.5s
+  |
+
+  | 38 | `tests/runner/test_extra_tools_downstream.py` | 209 | 3 | 1 |
+  downstream pipeline + observability + startup benchmark | — | rewrite |
+  pipeline `:44-96`, observability `:157-209` | drop slow perf test `:99-156`
+  (warm ratio <1.20, noise-sensitive) | configs | <=0.2s after drop |
+
+  | 39 | `tests/runner/test_lint_runner.py` | 479 | 41 | 0 | tool specs,
+  strategies, detect-secrets bootstrap, observability, print | — | keep | itself
+  | CLI/scope pins | runner | 0.20s |
+
+  | 40 | `tests/runner/test_lint_runner_integration.py` | 418 | 19 | 1 |
+  baseline overwrite, main exit codes, new-violation exit | — | keep | itself |
+  exit-code limb pin | runner | 1.18s |
+
+  | 41 | `tests/runner/test_lint_runner_stats.py` | 380 | 29 | 0 |
+  statistics/group/sort/fail-fast/registry | merge target for #52 | keep |
+  itself + merged stats cases | stats limb | runner | <=0.5s |
+
+  | 42 | `tests/runner/test_parsers_hypothesis.py` | 432 | 66 | 0 | Hypothesis
+  property tests for record/stats parsers | — | keep | itself | property
+  coverage | runner | 2.77s |
+
+  | 43 | `tests/runner/test_pyright_noise_filter.py` | 113 | 2 | 2 | pyright
+  noise-filter regression guard | — | keep | itself | regression guard | configs
+  | slow (2) |
+
+  | 44 | `tests/runner/test_real_pipeline_smoke.py` | 42 | 1 | 0 | full-pipeline
+  smoke; all 14 tool banners | `tests/integration.py:60-118` + `:331-389` |
+  remove | `tests/integration.py` (full pipeline golden + per-tool parity) |
+  duplicate end-to-end; 3.43s for no unique pin | runner | 3.43s measured |
+
+  | 45 | `tests/runner/test_runner_format_contract.py` | 157 | 12 | 0 | ADR-005
+  ruff-format modes + 14-tool registry | — | keep | itself | contract | configs
+  | 0.02s |
+
+  | 46 | `tests/runner/test_runner_private_imports.py` | 95 | 4 | 0 | no private
+  imports through runner package surface | — | keep | itself | surface lock |
+  runner | 0.11s |
+
+  | 47 | `tests/runner/test_self_lint_clean.py` | 59 | 1 | 1 | repo self-lint
+  (exit 0, no crash/skip, pylint 10.0) | `uv run lint` gate (AGENTS.md Quick
+  Commands) | remove | pre-commit/CI lint + `tests/integration.py` |
+  repo-self-lint, not product behavior; measured **154.32s and FAILED on HEAD
+  (exit 123)** | runner | 154.32s measured |
+
+  | 48 | `tests/runner/test_setup.py` | 385 | 31 | 0 | setup atomic
+  write/checksums/discovery/steps | — | keep | itself | setup | setup | 1.62s |
+
+  | 49 | `tests/runner/test_setup_install.py` | 371 | 7 | 1 | install steps +
+  downstream install->lint | — | keep (dedupe helper) | itself | duplicate
+  `_UvCallRecorder` only (`:36` vs `test_setup.py:39`) | setup | 5.72s |
+
+  | 50 | `tests/runner/test_t11_health_checks.py` | 383 | 17 | 1 |
+  consumer-agnostic health checks | — | keep | itself | product | runner | ~1s |
+
+  | 51 | `tests/runner/test_t1b_self_discovery.py` | 169 | 13 | 0 |
+  self-discovery helpers | — | keep | itself | product | runner | <=0.2s |
+
+  | 52 | `tests/runner/test_t3_coverage.py` | 390 | 33 | 0 | supplemental
+  parser/stats edge coverage | `test_lint_runner_stats.py` +
+  `test_baseline_diff_parsers.py` | merge | stats + parser matrices in the two
+  targets | supplementary cross-cutting cases; dedupe against parser matrix |
+  runner | <=0.5s |
+
+  | 53 | `tests/runner/test_t5_compose_ruff.py` | 366 | 21 | 0 |
+  `_compose_ruff_config` + RunnerConfig overrides | — | keep | itself | configs
+  limb pin | configs | 0.01s |
+
+  | 54 | `tests/runner/test_t9_7_compose_pyright.py` | 281 | 15 | 0 | pyright
+  compose + run_lint wire | — | keep | itself | configs limb pin | configs |
+  <=0.2s |
+
+  | 55 | `tests/runner/test_t9_7_compose_pyright_live.py` | 197 | 2 | 2 | live
+  pyright compose smoke | — | keep | itself | live config guard | configs | slow
+  (2) |
+
+  | 56 | `tests/runner/test_testing_fakes.py` | 197 | 9 | 0 | `testing`
+  lint-runner fakes | — | keep | itself | public testing surface | runner |
+  0.03s |
+
+  | 57 | `tests/test_golden.py` | 414 | 30 | 0 | golden
+  serialization/read/write/compare helpers | — | keep | itself (all 30) |
+  canonical/empty/order pins unique (fix 3) | golden | ~0.7s |
+
+  | 58 | `tests/test_setup_config_symlinks.py` | 162 | 7 | 0 |
+  `_step_config_symlinks` | — | keep | itself | setup | setup | <=0.2s |
+
+  | 59 | `tests/test_setup_precommit.py` | 176 | 7 | 0 | ruff version resolution
+  for pre-commit | — | keep | itself | setup | setup | <=0.2s |
+
+
+  Totals: 14,650 LoC, 1357 default-collected (+4 skipped), 18 slow.
+
+
+  ## 3. Pinning inventory for material limbs
+
+
+  ### 3.1 CLI and exit
+
+  | Limb | Pinning test(s) | Status |
+
+  |---|---|---|
+
+  | argparse flags/options accepted |
+  `tests/runner/test_lint_runner_integration.py:286-298`
+  (`test_main_argparse_given_flag_then_accepts` parametrized) | pinned |
+
+  | `main` exit codes (0/1/2 matrix) |
+  `tests/runner/test_lint_runner_integration.py:300-315`
+  (`test_main_exit_codes`) | pinned |
+
+  | `run_lint` returns int and runs all tools |
+  `tests/runner/test_lint_runner_integration.py:237-247`;
+  `tests/integration.py:60-118` (rc + no crash/skip + golden) | pinned |
+
+  | new violation exits nonzero |
+  `tests/runner/test_lint_runner_integration.py:366-388` | pinned |
+
+  | clean-project lint exit contract (0 or 2, never crash) |
+  `tests/integration.py:223-248` | pinned |
+
+
+  ### 3.2 Baseline and autofix
+
+  | Limb | Pinning test(s) | Status |
+
+  |---|---|---|
+
+  | baseline diff add/remove + drift resistance |
+  `tests/runner/test_baseline_diff.py:108-249`;
+  `tests/runner/test_baseline_diff_edge.py:25-73,113-312` (functional only; perf
+  class dropped) | pinned |
+
+  | baseline parser/capture matrix + schema v2 |
+  `tests/runner/test_baseline_diff_parsers.py:195-486` | pinned |
+
+  | baseline overwrite via CLI |
+  `tests/runner/test_lint_runner_integration.py:161-180`; `:317-364` | pinned |
+
+  | relative baseline paths | `tests/integration.py:295-330` | pinned |
+
+  | conflict-aware autofix apply (staged/unstaged/canary/revert) |
+  `tests/runner/test_autofix_conflict_apply.py:35-305` | pinned |
+
+  | `PYTHON_SETUP_LINT_NO_AUTOFIX` opt-out |
+  `tests/runner/test_autofix_conflict.py:229-303` | pinned |
+
+  | autofix observability skip/revert format |
+  `tests/runner/test_autofix_conflict.py:306-369` | pinned |
+
+  | downstream `--fix` does not crash; pre-commit entry has fix |
+  `tests/runner/test_autofix_conflict_integration.py:56-116`; `:117-140` |
+  pinned |
+
+  | built-in fix-tool set drift (`ruff`/`rumdl`/`ty`) |
+  `tests/runner/_autofix_helpers.py:17` (module import assert used by autofix
+  tests) | pinned |
+
+
+  ### 3.3 Configs and scopes
+
+  | Limb | Pinning test(s) | Status |
+
+  |---|---|---|
+
+  | ruff config composition (banned API, per-file ignores, temp dir, cache) |
+  `tests/runner/test_t5_compose_ruff.py:91-260` | pinned |
+
+  | run_lint consumes ruff/pyright overrides |
+  `tests/runner/test_t5_compose_ruff.py:298-360` | pinned |
+
+  | pyright compose (cwd, read-only fallback, JSON validity) |
+  `tests/runner/test_t9_7_compose_pyright.py:69-165`; live
+  `test_t9_7_compose_pyright_live.py:29-197` | pinned |
+
+  | config overlay end-to-end | `tests/integration.py:147-183`
+  (`test_config_overlay`) | pinned |
+
+  | shipped pylintrc single source of truth (main/tests/pyi) |
+  `tests/runner/test_config_consistency.py:35-90` | pinned |
+
+  | extra-tools parse/validation + downstream pipeline |
+  `tests/runner/test_extra_tools.py:1-346`;
+  `tests/runner/test_extra_tools_downstream.py:44-96,157-209` | pinned |
+
+  | 14-tool registry + ruff-format mode contract (ADR-005) |
+  `tests/runner/test_runner_format_contract.py:1-157` | pinned |
+
+  | tach whole-repo scope (`source_roots`) |
+  `tests/runner/test_lint_runner.py:318-334` | pinned |
+
+  | pylint scope/config discovery (`rcfile`, max-complexity warning) |
+  `tests/runner/test_lint_runner.py:123-180,335-346` | pinned |
+
+  | detect-secrets scope = `git ls-files` + baseline bootstrap |
+  `tests/runner/test_lint_runner.py:214-297` | pinned |
+
+  | per-tool scope parity end-to-end | `tests/integration.py:331-389`
+  (`test_individual_tool_parity`) | pinned |
+
+  | rumdl disabled-rules guard in shipped config |
+  `tests/integration.py:390-420` | pinned |
+
+  | **ty scope = `src/` only (oracle-reviewed exception)** | **No dedicated test
+  on HEAD**; only documented in `design/0002-ty-src-only-exception.md` +
+  `AGENTS.md` tool-scope table | **BLOCKING DEBT** — add a scope assertion in
+  iteration-3 (or explicitly accept the design doc as the pin) |
+
+
+  ## 4. Symbol exclusions (must not be edited/removed by debloat)
+
+  | Symbol/file | Range | Size | Owner | Rationale |
+
+  |---|---|---|---|---|
+
+  | `tests/checkers/test_semantic_check.py` | `:1-506` | whole file, 19 tests (3
+  slow) | semantic | replaced by CPU decision model (`_semantic.py` ->
+  `_decision*`); tests encode the outgoing reranker/embedding contract |
+
+  | `tests/checkers/test_semantic_threshold.py` | `:1-135` | whole file, 2 tests
+  | semantic | threshold behavior will be owned by the replacement model |
+
+  | `TestSuppressionRerankerPipeline` |
+  `tests/checkers/test_suppression_justification_checker.py:357-390` | 34 lines,
+  2 tests | semantic | full reranker pipeline; rest of file (`:1-356`) stays in
+  scope |
+
+  | `src/python_setup_lint/checkers/_semantic.pyi` | `:1-27` | 27 lines (whole
+  file; corrected from 1-42) | semantic | stub surface of the replaced module |
+
+
+  ## 5. Planned-path reservations
+
+  | Path | HEAD status | Owner | Purpose |
+
+  |---|---|---|---|
+
+  | `tests/conftest.py` (`:1-163`) | exists | tests-infra | epic-shared
+  conftest; reserve for cross-area fixtures and dedupe of `_UvCallRecorder`
+  (currently duplicated at `tests/runner/test_setup.py:39` and
+  `tests/runner/test_setup_install.py:36`) |
+
+  | `tests/runner/conftest.py` | **absent** (verified) | runner | runner-scoped
+  fixtures reserved; no HEAD collision |
+
+  | `src/python_setup_lint/runner/runtime/` | **absent** (verified) | runner |
+  runtime module package reservation; no HEAD collision |
+
+  | `tests/runner/runtime/` | **absent** (verified) | tests-infra | tests for
+  the runtime package |
+
+  | `src/python_setup_lint/checkers/_decision*.py` (+`.pyi`) | **absent**
+  (verified; `ls _decision*` empty) | semantic | CPU-friendly decision-model
+  replacement for `_semantic.py` |
+
+  | `tests/checkers/test_decision*.py` | **absent** (verified) | semantic |
+  decision-model tests replacing the excluded semantic symbols |
+
+  | `tests/data/golden/**`, `tests/data/minimal_sample_project/**` | exists |
+  root-owned (external) | fixtures; excluded from audit and from any debloat
+  edits |
+
+
+  ## 6. Removal list, slow budget, LoC budget
+
+
+  ### 6.1 Repo-self-lint / redundant removals (whole files)
+
+  | Module | LoC | Slow | Evidence |
+
+  |---|---|---|---|
+
+  | `tests/runner/test_self_lint_clean.py` | 59 | 1 | Repo self-lint duplicates
+  `uv run lint` (AGENTS.md Quick Commands); measured 154.32s and **FAILS on HEAD
+  with exit 123**. Surviving gate: pre-commit/CI lint + integration suite. |
+
+  | `tests/runner/test_bench_runner_overhead.py` | 241 | 1 | No assertions;
+  writes an artifact only. Measured 8.36s. 1 slow test, not 2 (fix 1). |
+
+  | `tests/runner/test_real_pipeline_smoke.py` | 42 | 0 | Duplicate end-to-end
+  of `tests/integration.py:60-118` (golden, crash/skip checks) + `:331-389`
+  (per-tool parity). Measured 3.43s. |
+
+
+  Hard-removal subtotal: **342 LoC, 2 slow tests**.
+
+
+  ### 6.2 Perf-assertion rewrites (functional tests retained)
+
+  | Module | Dropped lines | Slow | Retained |
+
+  |---|---|---|---|
+
+  | `tests/runner/test_baseline_diff_edge.py` | `:74-110` (`TestPerfBenchmark`:
+  200ms compare, 1s diff ceilings) | 1 | functional edge/schema tests
+  `:25-73,113-312` |
+
+  | `tests/runner/test_extra_tools_downstream.py` | `:99-156` (`_time_run_lint`
+  + warm ratio <1.20) | 1 | downstream pipeline `:44-96`, observability
+  `:157-209` |
+
+
+  Rewrite subtotal: **~95 LoC, 2 slow tests**.
+
+
+  ### 6.3 Merge-retired files (tests survive in the survivor)
+
+  | Module | LoC | Merge target |
+
+  |---|---|---|
+
+  | `tests/checkers/test_stub_checker_callable.py` | 276 |
+  `tests/checkers/test_stub_fidelity_invariants.py` |
+
+  | `tests/checkers/test_stub_checker_class.py` | 155 |
+  `tests/checkers/test_stub_fidelity_invariants.py` |
+
+  | `tests/checkers/test_stub_normalizer.py` | 91 |
+  `tests/checkers/test_stub_checker.py` |
+
+  | `tests/runner/test_t3_coverage.py` | 390 |
+  `tests/runner/test_lint_runner_stats.py` +
+  `tests/runner/test_baseline_diff_parsers.py` |
+
+
+  Merge-retired subtotal: **912 LoC** (candidate pool; net reduction is lower
+  because test bodies survive after dedup).
+
+
+  ### 6.4 Budget arithmetic (recomputed)
+
+  - Candidate LoC pool = 342 (remove) + 95 (rewrite) + 912 (merge-retired) =
+  **1,349 LoC**, inside the retained **1.3-1.8k** band.
+
+  - Net LoC reduction after dedup/merge is lower: hard removals 342 + perf
+  rewrites 95 + dedup estimate 250-550 = **~0.7-1.0k**; iteration-3 replan must
+  recompute after HEAD re-glob and must not book merge-retired LoC as net
+  deletion.
+
+  - **Slow budget: 18 on HEAD** -> 16 after the 2 hard removals (bench 1,
+  self-lint 1) -> **14** after dropping the 2 slow perf benchmarks. (No other
+  module loses a slow test in this audit; semantic slow tests are excluded, not
+  removed.)
+
+
+  ## 7. Verification of the review fixes
+
+  - Bench: `--collect-only` on the file -> `no tests collected (1 deselected)`;
+  one `@pytest.mark.slow` at `:118` on the single test at `:119`; slow run -> `1
+  passed in 8.36s`.
+
+  - Surface lock: `TestPublicSymbolSurface` retained;
+  `tests/checkers/test_stub_fidelity_invariants.py:277-322` selected together
+  with `tests/test_golden.py` -> **33 passed in 0.77s** (no behavioral change;
+  read-only evidence run).
+
+  - Golden pins: all four serialization tests `:152-198` retained; only non-test
+  serialization call sites are `tests/_golden.py:398,406` (determinism replay)
+  and `tests/test_golden.py:347-348` (round-trip).
+
+  - `_semantic.pyi`: `wc -l` = 27; exclusion row now `:1-27`.
+
+
+  ## 8. Uncertainties for iteration-3 replan
+
+  - Owner tokens are the r1 unified-map subsystem tokens; the coding-rules-audit
+  report is not in this repository, so owner alignment could not be re-verified
+  in this read-only step (review did not flag owner mismatches).
+
+  - Merge-dedup LoC and the 0.7-1.0k net-reduction estimate are approximations;
+  only the 342/95 hard figures and the 18->14 slow arithmetic are directly
+  measured.
+
+  - Runtimes are environment-sensitive (full suite 24.33s here vs ~53s in
+  AGENTS.md; setup_install 5.72s vs 6.53s/9.69s earlier).
+
+  - `test_self_lint_clean` exit 123 may reflect this worktree's current lint
+  state; the removal rationale rests on it duplicating the repo lint gate, not
+  on the specific failure.
+
+  - `tests/data/**` was excluded by instruction and not audited; the 9-line
+  `test_tempfile.py` fixture explains the 3,707 vs 3,716 helper LoC difference.
+contextPack: "HEAD facts for replan: 59 test files (58 test_*.py +
+  tests/integration.py), 14,650 wc -l LoC, 1379 collected = 1357 default + 4
+  skipped + 18 slow. Fixes: bench=241 LoC/0 default/1 slow (8.36s, no asserts);
+  TestPublicSymbolSurface KEEP (19-name surface lock,
+  test_stub_fidelity_invariants.py:277-322); golden canonical/empty/order pins
+  KEEP (test_golden.py:152-198; integration replay only determinism at
+  integration.py:120-122); _semantic.pyi exclusion = 1-27. Removals:
+  test_self_lint_clean.py (59, 1 slow, 154.32s, FAILS exit 123),
+  test_bench_runner_overhead.py (241, 1 slow), test_real_pipeline_smoke.py (42).
+  Rewrites: baseline_diff_edge perf class (:74-110), extra_tools_downstream perf
+  (:99-156), 2 slow. Merges:
+  stub_callable(276)+stub_class(155)->fidelity_invariants,
+  stub_normalizer(91)->stub_checker, t3_coverage(390)->stats+baseline parsers.
+  Candidate pool 1,349 LoC; slow 18->16->14. Blocking debt: ty src-only scope
+  has no test pin. Symbol skips: test_semantic_check.py:1-506,
+  test_semantic_threshold.py:1-135, TestSuppressionRerankerPipeline:357-390,
+  _semantic.pyi:1-27. Reservations: tests/conftest.py, tests/runner/conftest.py
+  (absent), runner/runtime/ (absent), checkers/_decision* (absent)."
+sources:
+  - tests/runner/test_bench_runner_overhead.py:118-241
+  - tests/checkers/test_stub_fidelity_invariants.py:277-322
+  - tests/test_golden.py:152-198
+  - tests/integration.py:115-122
+  - src/python_setup_lint/checkers/_semantic.pyi:1-27
+  - tests/checkers/test_semantic_check.py:1-506
+  - tests/checkers/test_semantic_threshold.py:1-135
+  - tests/checkers/test_suppression_justification_checker.py:357-390
+  - pyproject.toml:49-55
+  - AGENTS.md:1-30
+  - tests/runner/test_self_lint_clean.py:1-59
+  - tests/runner/test_real_pipeline_smoke.py:1-42
+  - tests/runner/test_extra_tools_downstream.py:99-156
+  - tests/runner/test_baseline_diff_edge.py:74-110
+  - tests/runner/test_lint_runner_integration.py:286-388
+  - tests/runner/test_baseline_diff_parsers.py:195-486
+  - tests/runner/test_autofix_conflict_apply.py:35-305
+  - tests/runner/test_autofix_conflict.py:229-369
+  - tests/runner/test_t5_compose_ruff.py:91-360
+  - tests/runner/test_t9_7_compose_pyright.py:69-270
+  - tests/runner/test_config_consistency.py:35-90
+  - tests/runner/test_lint_runner.py:214-346
+  - tests/conftest.py:1-163
+  - design/0002-ty-src-only-exception.md
+recommendations:
+  - "Apply the four corrections verbatim in iteration-3: bench row is 241/0/1
+    slow; TestPublicSymbolSurface and all test_golden.py:152-198 serialization
+    pins stay KEEP; _semantic.pyi exclusion is 1-27."
+  - Remove the three redundant whole files (test_self_lint_clean.py,
+    test_bench_runner_overhead.py, test_real_pipeline_smoke.py) and drop the two
+    slow perf-assertion blocks; this yields the verified 342 + ~95 LoC and the
+    18 -> 14 slow reduction.
+  - Execute the four merges only after a HEAD re-glob confirms the survivor
+    files still contain the target coverage; book merge-retired LoC as candidate
+    pool, not net deletion (net ~0.7-1.0k).
+  - Add a dedicated `ty check` src-only scope pin (or explicitly accept
+    design/0002 as the pin) to clear the only config/scope blocking-debt flag
+    found.
+  - "Keep semantic symbols untouched: do not edit test_semantic_check.py,
+    test_semantic_threshold.py, TestSuppressionRerankerPipeline, or
+    _semantic.pyi; the decision-model epic owns their replacement and the
+    reserved paths checkers/_decision* and tests/checkers/test_decision*."
+  - Reserve tests/runner/conftest.py and runner/runtime (absent on HEAD) for the
+    epic before any new fixtures/runtime modules land; dedupe the duplicated
+    `_UvCallRecorder` helper into tests/conftest.py.
+  - "Carry the runtime caveat into replan: figures are WSL2/Python
+    3.14.4/warm-cache measurements (+/-30% for subprocess tests); the self-lint
+    test's exit-123 failure is worktree-state-sensitive but does not affect the
+    removal rationale."

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
