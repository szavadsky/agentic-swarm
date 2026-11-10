# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Exploration budget: work primarily from INTENT, triage citations (`citations:
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
`), and the prepared context pack (`# Context Pack — `modernize`

> Repository: `python-setup` v1.2.10, `requires-python = "3.14"` (`pyproject.toml:1-5`). Worktree: `topic_modernize`. Working tree was clean at HEAD except factory journal state. Source is ~8,890 LOC of Python; tests are ~18,401 LOC with 772 `test_*` functions.

## 0. Executive snapshot — current gates are NOT green

These are measured facts the architect must plan around; they are independent of the `modernize` intent but any behavior-preserving refactor starts here.

| Gate | Current result | Evidence |
|---|---|---|
| `uv run pytest -q` | **6 failed, 1334 passed, 4 skipped, 18 deselected**, ~30 s | Run on HEAD. All 6 failures are stale 13-tool assumptions vs the 14-entry `TOOLS` table. |
| `uv run pytest tests/integration.py -q` | **9 passed**, ~65 s | Golden/integration gate passes today. |
| `uv run lint` | **not green**; two product violations are masked by an empty baseline; detect-secrets also flags tracked factory journal files in this worktree | `ruff check` → `SIM102` at `src/python_setup_lint/checkers/stub/coverage.py:196-198`; `pylint` → `too-many-locals` (23/20) at `src/python_setup_lint/runner/cli.py:50`; `lint.baseline:1` is `[]`. |
| `uv run lint` side effect | **mutates the worktree**: `ruff format` is run in the normal lint pass without `--check` and without the shipped ruff config; with the default config 109 files would be reformatted, while with `config/ruff.toml` all 179 files are already formatted | `dispatch.py:40-48`; `cli.py:118-153`; `cmd_build.py:108-123`; `config/ruff.toml:1` |

**Critical mismatch:** `TOOLS` now has 14 entries including `ruff format` (`src/python_setup_lint/runner/dispatch.py:38-129`), but many tests/docs still assert 13:
- `tests/runner/test_lint_runner.py:49-76` (`len(...) == 13`; expected set omits `ruff format`).
- `tests/runner/_factories_extras.py:374-382` (`len(f.calls) == 13`, id `all_13_tools_dispatched`).
- `tests/runner/test_lint_runner_stats.py:72-74` and `tests/runner/test_t3_coverage.py:52-58` require every `TOOLS` entry to have a statistics parser; `ruff format` intentionally has none.
- Failing tests: `test_tool_spec_given_known_tools_then_present`, `test_tool_spec_given_tools_then_autofix_and_no_duplicates`, `test_statistics_parsers_given_all_tools_then_covered`, `test_parser_completeness_given_all_tools_then_have_parser`, and both `test_run_lint_with_fake_dispatch_invariants[...]` rows.
- Docs also say 13: `AGENTS.md:9,43,63,92-93`; `src/python_setup_lint/runner/cli.py:314`.

Commit `db5799d` (factory consolidation) changed test expectations from 14 back to 13 and emptied `lint.baseline` without fixing the two underlying violations; that is the source of the red baseline. `AGENTS.md:91` still claims 1290 pass/4 skip/15 deselected; measured is 1334/4/18.

## 1. Module map

| Area | Files | Responsibility |
|---|---|---|
| Checker framework | `src/python_setup_lint/checkers/_base.py` (238 lines), `_semantic.py` (189), `_semantic.pyi` | Shared message factory, source-root/path helpers, `check_if_meaningful`; optional semantic scorer. |
| Conformance checkers | `src/python_setup_lint/checkers/conformance/*.py` (15 checkers) | Pylint plugins enforcing CodingRules: beartype, no-try-import, asyncio-timeout, tmp-path, structlog, error-chain, trivial-wrapper, redundant-type-guard, bare-except-comment, missing-return-annotation, silent-except, suppression-justification, pyi-underscore, unnamed-tuple-dict, generic-key-dict. Registered via `config/.pylintrc:7` and `config/.pylintrc-tests:24`. |
| Stub checkers | `src/python_setup_lint/checkers/stub/*` (checker, coverage, docstring, fidelity/orchestrator, annotation, signature, kind, normalizer, import_contract) | Enforce `.pyi` presence/fidelity and docstring location/`Returns:` rules. |
| Runner | `src/python_setup_lint/runner/*` | 14 `ToolSpec`s (`dispatch.py:38-129`), command construction (`cmd_build.py`), sequential pipeline/autofix phases (`cli.py:50-153`), parsers (`parsers.py`, `_record_parsers.py`), baseline diff (`baseline.py`), output/statistics (`output.py`), config resolution (`_config.py`), extra tools (`extra_tools.py`). |
| Setup/install | `src/python_setup_lint/setup.py`, `_setup_precommit.py`, `_setup_pyproject.py`, `_setup_update.py` | Installs configs/symlinks/pre-commit in consumer projects. |
| Test utilities | `src/python_setup_lint/testing.py` | `_make_tc`, `_walk_and_release`, fake runner utilities used by checker/runner tests. |
| Golden contract | `tests/_golden.py` (423), `tests/test_golden.py` (341), `tests/data/golden/*.json` | Canonical findings snapshot: normalize/serialize/assert, update flag, per-tool minimums. |
| Assumptions | `tests/assumptions/test_{astroid,pylint,beartype}_contracts.py` | Pin third-party behavior before debloating (added by prior waves). |
| Sample oracle | `tests/data/minimal_sample_project/` | Planted violations; `violations.txt` lists every required rule; `tool_counts.json` pins per-tool minimums. |
| Docs/ADRs | `docs/semantic-justification.md`, `docs/custom-checks.md`, `docs/adr/ADR-001..004.md`, `AGENTS.md`, `CodingRules.md` | Current semantic contract, checker API, architecture decisions, project rules. |

### Runner data flow
`pyproject.toml`/`RunnerConfig` → `_select_tools` (`runner/_cli_complexity.py:41-56`) → `_run_tool_pipeline` (`cli.py:50-153`) → subprocess per tool → `LintResult` → parsers/statistics → baseline diff → report. With `--fix`, phase 1a formats, phase 1b fixes, phase 2 re-lints all tools (`cli.py:66-153`).

### W9704 data flow
`SuppressionJustificationChecker.visit_module` scans raw source lines (`suppression_justification_checker.py:43-91`) → trailing/preceding reason extraction (`:330-388`) → `check_if_meaningful` (`_base.py:142-238`) → semantic scorer if enabled, else heuristic → `add_message("unjustified-suppression")`. Any-annotation paths use the same helper (`suppression_justification_checker.py:126-184`). `BareExceptCommentChecker` also calls it (`bare_except_comment_checker.py:73-124`).

## 2. Key interfaces & signatures

### `check_if_meaningful` — `src/python_setup_lint/checkers/_base.py:142-158`
```python
@beartype
def check_if_meaningful(
    text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None
) -> bool:
    if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1":
        from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
        result = _semantic_check(text, rule=rule, code_context=code_context, comment=comment)
        if result is not None:
            return result
    # heuristic fallback: strips comment/text, rejects <5 chars, exact boilerplate/brush-off, rule-symbol-only
```

### `semantic_check_if_meaningful` — `src/python_setup_lint/checkers/_semantic.py:125-189`
```python
def semantic_check_if_meaningful(
    text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None
) -> bool | None:
    primary = (comment or text).strip()
    # cache key = first 8 bytes of SHA-256(text|rule|code_context|comment|model)
    # cache hit -> return stored bool
    reranker = _load_reranker()
    if reranker is None: return None          # caller falls back to heuristic
    query = " | ".join([f"rule: {rule}", f"context: {code_context[:200]}"]) or primary
    score = float(reranker.predict([(primary, query)])[0])
    result = score >= 0.5
    cache[key] = result; _save_result_cache(); return result
```

### Other critical symbols
- `ToolSpec` (`runner/types.py:1-30`): `name`, `command`, `supports_fix`, `supports_path`, `supports_exclude`, `default_paths`, `fix_flags`, `exclude_flag`, `timeout`, `memory_limit_mb`.
- `RunnerConfig`: pipeline inputs including `cwd`, `package_name`, `config_paths`, `tool_timeouts`, `tool_memory_limits`, `tools_override` (used at `_cli_complexity.py:41-56`).
- `LintResult`, `Record`, `ViolationCount` (`runner/types.py`, `_record_types.py`).
- `_reset_cache()`, `_load_reranker()`, `_RERANKER_UNAVAILABLE`, `_RERANKER_MODEL` (`_semantic.py:26-31,40-52,81-122`) — private test seams currently imported directly by tests.
- Env vars: `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`), `PYTHON_SETUP_LINT_RERANKER_MODEL` (default `jina-reranker-v2-base-multilingual`), `PYTHON_SETUP_LINT_NO_AUTOFIX`, `PYTHON_SETUP_LINT_FORCE_FIX`, `PYTHON_SETUP_LINT_UPDATE_GOLDEN` (`_semantic.py:49-52`; `_base.py:151`; `tests/_golden.py:51-52`).
- Checker registration: packaged as pylint plugins in `config/.pylintrc:7` / `.pylintrc-tests:24`; each module exposes `register(linter)`.

## 3. Relevant excerpts

### 3.1 Current semantic module is a cross-encoder reranker, not a decision model
- Module docstring states single-stage cross-encoder reranking, lazy load, `None` on failure (`_semantic.py:1-12`).
- Cache dir/model globals (`_semantic.py:37-52`):
```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get("PYTHON_SETUP_LINT_RERANKER_MODEL", "jina-reranker-v2-base-multilingual")
```
- Loader imports `sentence_transformers.CrossEncoder`, downloads to `_CACHE_DIR`, disables on `ImportError/OSError/RuntimeError/ValueError` (`_semantic.py:93-122`).
- Cache helpers load/save JSON mapping `str(key)->bool`; `_reset_cache` deletes the file (`_semantic.py:55-90`).
- All cache keys are truncated to 64 bits (`int.from_bytes(cache_key[:8], "big")`, `_semantic.py:155-157`) — collision risk and no schema/model-revision field beyond the model string.
- The optional extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); in the dev venv `sentence_transformers`, `torch`, and `transformers` are **not installed**, so today the semantic path returns `None` and the heuristic makes every decision. This matches `docs/adr/ADR-002.md:3`.

### 3.2 W9704 callers and message contract
- Message: `W9704`, symbol `unjustified-suppression`, text `"Suppression comment without technical justification: %s"` (`suppression_justification_checker.py:33-41`).
- Trailing reason logic checks every suppression match, takes text before the next suppression pattern, and calls `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:356-375`). Preceding-comment path at `:377-386`.
- Any-parameter/return path calls the same function on a trailing reason, else emits W9704 (`:136-162`).
- Bare-except checker calls it for trailing and preceding comments (`bare_except_comment_checker.py:98-122`).
- `check_if_meaningful` heuristic (`_base.py:160-238`) rejects empty/`<5` chars, a large exact boilerplate set (including `pre-existing`, `baseline`, `wip`, `temp`, `legacy`, `later`, `for now`, `carryover`), exact brush-off phrases, and a reason equal to the rule symbol. Matching is **exact-string**, not semantic.

### 3.3 Runner: 14 tools, formatter config gap
- `TOOLS` order: tach, **ruff format**, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets (`dispatch.py:38-129`).
- `ruff format` is `supports_fix=False`, `default_paths=["src/","tests/"]` (`dispatch.py:40-48`); phase 1a runs it before fix tools (`cli.py:72-85`), but the normal pass also runs it (`cli.py:118-153`). `_build_command` adds no `--check` (`cmd_build.py:288-305`).
- Shipped config mapping omits `ruff format` (`runner/_config.py:8-14`: only `ruff check` → `ruff.toml`); `_config_flag_for` also omits it (`cmd_build.py:108-123`). Result: `ruff format` uses defaults (line-length 88) instead of `config/ruff.toml` (line-length 130, `config/ruff.toml:1`). Verified with `ruff format --check`: shipped config = 179 already formatted; default config = 109 files would reformat.
- A correct fix likely: map `ruff format` to the ruff config, add `--config`, and run `--check` in non-fix mode (or exclude format from the normal pass). This is a design decision because `AGENTS.md:9` describes `uv run lint` as the 13-tool lint pipeline, while phase 1a needs a mutating formatter under `--fix`.
- Two real violations currently masked by `lint.baseline:1`:
  - `src/python_setup_lint/checkers/stub/coverage.py:194-198` nested `if` (`SIM102`).
  - `src/python_setup_lint/runner/cli.py:50` `_run_tool_pipeline` has 23 locals vs max 20 (`too-many-locals`); `config/.pylintrc:21-27` sets `max-locals=20`.

### 3.4 Golden behavior contract (prior wave)
- `tests/integration.py:116-200` runs the full sample pipeline, asserts every `TOOLS` section appears, no crash/skip, W9705 fires, then collects findings on a pristine copy and compares to the committed multiset golden.
- `collect_findings` deliberately selects only tools with a record parser (`tests/_golden.py:202-247`), so formatter/statistics-only tools do not mutate or pollute line numbers.
- Golden file: `tests/data/golden/minimal_sample_project_findings.json` (21,783 bytes; 18 W9704 entries across pylint/pylint-pyi/pylint tests) and `..._tool_counts.json` (14 keys including `"ruff format": 0`).
- Oracle rules: `tests/data/minimal_sample_project/violations.txt`; helper `assert_oracle_coverage` (`tests/_golden.py:412-416`) and `assert_tool_coverage` (`:419-423`).
- Update guard: `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`; refuses to rewrite under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:372-388`; `tests/test_golden.py:242-283`).
- Integration forces `PYTHON_SETUP_LINT_SEMANTIC=0` for the snapshot (`tests/integration.py:173-174`), so the golden does **not** currently exercise the semantic model path. Any model swap needs an additional deterministic (cache-hit/no-network) semantic test.

### 3.5 CodingRules sections that drive the modernization
- Simplification: remove redundant wrappers/checks/fallbacks, extract duplicated logic, prefer direct approaches (`CodingRules.md:90-107`).
- Complexity enforced, not baselined: `max-branches=16`, `max-statements=65`, `max-module-lines=500`; over-limit modules must be split (`CodingRules.md:139-159`; `config/.pylintrc:1-3,21-27`).
- Tests: mock only external boundaries; verify third-party assumptions in dedicated tests; optimize test LoC/complexity; prefer long end-to-end scenario tests with intermediate assertions; parametrize; golden snapshots; factories; independent tests; naming `test_<method>_given_<condition>_then_<expected>`; shared fixtures only in conftest (`CodingRules.md:230-306`).
- Typing/stubs: `.pyi` required for all non-`__init__` modules; expose public members only; docstrings belong in `.pyi` (`CodingRules.md:35-67`). `_semantic.pyi:1-27` currently mirrors only the public function.

## 4. Existing tests & conventions

### Layout and selection
- Checker tests: `tests/checkers/` (25 files). Runner tests: `tests/runner/` (30 files). Integration: `tests/integration.py`. Assumptions: `tests/assumptions/`. Golden helpers: `tests/_golden.py` + `tests/test_golden.py`.
- `pyproject.toml:48-55`: default `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail`.
- `tests/conftest.py:30-35` puts `.venv/bin` on PATH for subprocess tools; `:62-89` session-scoped `configured_project`; `:93-123` `tmp_baseline`/`runner_config_factory`; `:170-178` `shipped_config_paths`.
- Checker tests use `_make_tc_factory` from `src/python_setup_lint/testing.py` and shared data/factories in `tests/checkers/_factories.py` (1,393 lines; `# pylint: disable=too-many-lines` at line 15).
- Runner tests use `tests/runner/_factories.py` (canned results, fake runner, baseline helpers), `_factories_extras.py` (502 lines; duplicate `too-many-lines` disables at lines 1 and 6), `_factories_tables.py` (394 lines).

### Semantic/justification test surface (prime debloat + rewrite target)
- `tests/checkers/test_semantic_check.py` — 506 lines, 19 tests, `too-many-lines` disable at line 1. Includes:
  - `TestImportErrorFallback` (`:20-42`) patches `builtins.__import__` to make `_semantic` unimportable and asserts `ImportError` propagates; this tests an infrastructure assumption, not product behavior.
  - `TestDefaultUserFallback` (`:48-77`) patches `_load_reranker` to `None`.
  - `TestRerankerImportFallback` (`:83-153`) asserts sentinel prevents retry storm.
  - `TestBrushOffPatterns` (`:159-209`) and `TestMeaningfulPatterns` (`:212-257`) duplicate the heuristic patterns also covered by `test_semantic_threshold.py`.
  - `TestSemanticCheck` (`:263-418`) has permissive assertions (`None or isinstance(bool)`, `False or None`) and a `@pytest.mark.slow` download test.
  - `TestRerankerPairs` (`:424-506`) encodes the cross-encoder contract; all four tests use `importorskip` and permissive assertions.
- `tests/checkers/test_semantic_threshold.py` — 138 lines; two parametrized tests over 30 meaningful + 50 meaningless comments with `PYTHON_SETUP_LINT_SEMANTIC=0`; overlaps the heuristic pattern tests above.
- `tests/checkers/test_suppression_justification_checker.py` — 390 lines, 42 tests. `TestSuppressionRerankerPipeline` (`:357-390`) is `@pytest.mark.slow`, `importorskip("sentence_transformers")`, and tests only two comments through the full checker.
- Private imports from `_semantic` carry repeated `# type: ignore[attr-defined]` comments (e.g. `test_semantic_check.py:53,67,91,136,325,434`), evidence that the module API/test seam needs redesign.

### Runner test duplication candidates
- Baseline diff split across `tests/runner/test_baseline_diff.py` (321 lines), `test_baseline_diff_edge.py` (504), `test_baseline_diff_parsers.py` (553) — overlapping `compare_sorted`/`diff_baseline`/parser coverage.
- Runner split across `test_lint_runner.py` (493 lines), `test_lint_runner_integration.py` (445), `test_lint_runner_stats.py` (377) — all three disable module-line limits and exercise the same `run_lint`/`build_command`/statistics paths.
- `tests/test_golden.py` (341 lines, 25 tests) unit-tests golden helper internals; `tests/_golden.py` is test infrastructure (423 lines). Decide whether helper-level tests are `implementation_detail` / worth retaining under the “test infra/assumptions first” rule.
- `tests/runner/test_parsers_hypothesis.py` (432 lines, 66 parametrized tests) uses hypothesis per CodingRules; likely keep unless coverage overlaps `test_baseline_diff_parsers.py`.
- `tests/integration.py` (661 lines, 9 tests) has `too-many-lines` disable; it is the key fit-for-purpose gate and should stay, but helper duplication was already a prior consolidation target.
- Tests import test-data factories with `Any` and many `# pylint: disable` comments; these are intentional, not necessarily violations.

## 5. Model replacement research — facts for the architect/spike

### Current problem restated
`_semantic.py` uses `sentence-transformers` + a cross-encoder (`jina-reranker-v2-base-multilingual`) with a 0.5 threshold. The dependency is optional and absent in dev/CI; model download failures are swallowed; results are cached per machine in `~/.cache/python-setup/semantic/results.json` (gitignored, unbounded, 64-bit truncated keys). `docs/adr/ADR-002.md` and `ADR-003.md` already state the intent: CPU-friendly small decision model + git-stored self-cleaning cache.

### Candidate models (verified from model cards/API)
| Candidate | Size / weights | CPU / deps | License | Decision-index evidence | Fit / risk |
|---|---|---|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B params, 0.81 GB bf16 | Model card tested on CUDA only; `glide` package pins `torch==2.14.0`, `transformers==5.17.0`; bf16 weights; 8k context; one forward pass per question | **Fastino Community License** (commercial production restrictions >$10M revenue; notice requirements) | 51.10 public suite; family blog: 0.4B Full 33.84, 7 ms median on RTX PRO 6000 | Accuracy ceiling per intent but not proven CPU-friendly; heavy dependency; license must be reviewed for an MIT package |
| `tasksource/tasksource-decider-nano` | 149M params, BF16, ModernBERT cross-encoder | `decider.py` defaults device to `cuda` if available else **CPU**; PyTorch + transformers + safetensors + huggingface_hub; 8,192-token limit, no truncation | **Apache-2.0** | #1 under 300M on Decision Index 0.4 (Full 19.85); public 0.3 index 33.51; 23 ms median on A30 | Best low-license CPU candidate; generic decision model, not trained specifically on code-review justifications; needs threshold calibration |
| `hotchpotch/bekko-system-one-v0-17m` | 16.8M params; ONNX browser model ~29 MB | CPU via sentence-transformers `BekkoSentenceTransformer`, SDPA; `torch>=2.10,<2.11`, `transformers==5.17.0`, `sentence-transformers==6.1.0`; `trust_remote_code` | No license declared in model card | S1MB 27.57 vs Jev 1.13 59.59; authors warn limited generalization | Very small/fast and ONNX option, but accuracy risk and unclear license |
| `Elfsong/jev-ettin-150m-v16` | 149.6M params, F32 | Custom PyTorch inference code in repo; CPU possible | Apache-2.0 | No card score in API metadata | Viable alternate 150M; custom code/vendoring burden |
| `tardellirs/crivo-68m`, `codavidgarcia/mola-68m` | 68M | PyTorch/transformers | **CC-BY-NC-4.0** | Public/full index entries | Non-commercial license blocks use in an MIT tool; avoid |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | 22.7M | CPU-friendly | Apache-2.0 | Relevance reranker, not a decision model | Cheap fallback baseline; not calibrated for “meaningful justification” |

Sources: [GLiDE-0.4B card](https://huggingface.co/fastino/GLiDE-0.4B), [GLiDE license](https://huggingface.co/fastino/GLiDE-0.4B/raw/main/LICENSE), [GLiDE requirements](https://huggingface.co/fastino/GLiDE-0.4B/raw/main/requirements.txt), [GLiDE family blog](https://fastino.ai/blog/glide-decision-model-family), [tasksource-decider-nano](https://huggingface.co/tasksource/tasksource-decider-nano), [decider.py](https://huggingface.co/tasksource/tasksource-decider-nano/raw/main/decider.py), [bekko-17m](https://huggingface.co/hotchpotch/bekko-system-one-v0-17m), [Elfsong-150m API](https://huggingface.co/api/models/Elfsong/jev-ettin-150m-v16), [crivo-68m API](https://huggingface.co/api/models/tardellirs/crivo-68m), [mola-68m API](https://huggingface.co/api/models/codavidgarcia/mola-68m), [JEV decision index](https://huggingface.co/spaces/multimodalart/jev-decision-index).

### Proposed decision-model call shape (needs spike validation)
`state = {comment, rule, code_context}`; question type `noul`: “Is this a specific technical justification for suppressing this lint rule, rather than a placeholder, deferral, or brush-off?”; criteria descriptions for true/false; threshold calibrated on the existing labelled comments plus real repo suppression comments. `tasksource-decider-nano` returns `{"answers": {"meaningful": {"type": "noul", "noul": P(true)}}}` (`decider.py` `answer` method). GLiDE returns `{"answers": {qid: {"noul": P(true), "confidence": ...}}}`.

### Cache facts and open design space
- Current cache is per-machine and gitignored: `.gitignore:243-244` (`.cache/python-setup/semantic/`), `_semantic.py:37-47,55-90`.
- Legacy key includes `text|rule|code_context|comment|model`; first 8 bytes only; changing code context invalidates; stale entries never pruned.
- Git-tracked alternatives: a JSON/NDJSON file inside `src/python_setup_lint/` or a top-level cache dir. Packaging currently force-includes only `config/` and `CodingRules.md` (`pyproject.toml:44-46`), so any package-data cache needs hatch inclusion.
- Determinism requirement: W9704 must not differ between machines with/without the model. A tracked cache can serve as the source of truth; model runs only on cache miss or in an explicit refresh command. If lint writes the cache, lint becomes non-hermetic; safer to require an explicit `--update` / env flag and keep normal lint read-only.

## 6. Debloat / coding-rule enforcement inventory

| Target | Evidence | Notes / intent risk |
|---|---|---|
| Test suite volume | Tests ~18,401 LOC vs src ~8,890; 772 test functions; 6 failing | Debloat metrics need definition (LOC, test count, runtime, duplication). Preserve golden/integration intent. |
| `tests/checkers/_factories.py` | 1,393 lines; `too-many-lines` disable line 15 | Pure data; CodingRules says split over-500 modules. Could split by checker group. |
| `tests/runner/_factories_extras.py` | 502 lines; two overlapping `too-many-lines` disables at lines 1 and 6 | Duplicate disable comment itself is bloat. |
| `tests/integration.py` | 661 lines; `too-many-lines` disable line 12 | Prior consolidation inlined helper logic instead of reducing; keep behavior contract. |
| `tests/checkers/test_semantic_check.py` | 506 lines; `too-many-lines` disable line 1; 19 tests | Must be rewritten for the model swap; merge heuristic pattern tests with `test_semantic_threshold.py`; remove impossible `ImportError` propagation test. |
| `tests/checkers/test_semantic_threshold.py` | 138 lines; overlaps heuristic patterns | Keep as the labelled evaluation corpus; consolidate with semantic heuristic tests. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines / 42 tests; 2 slow reranker tests | Parametrize near-identical tests; move model-path coverage to new semantic test module. |
| Three baseline-diff test files | 321 + 504 + 553 lines | Merge into scenario-based tests around `diff_baseline`; keep edge/perf separately only if they protect distinct invariants. |
| Three runner test files | 493 + 445 + 377 lines; all `too-many-lines` disabled | Consolidate around `run_lint` scenarios; keep tool-registry invariant table one place. |
| `tests/test_golden.py` | 341 lines / 25 helper-unit tests | Tests test infrastructure; check whether each is `implementation_detail` and whether scenario coverage in `integration.py` already suffices. |
| `_semantic.py` / `_base.py` | 189 + 238 lines | Heuristic duplicated between semantic module and base; cache helpers and singleton globals are test-coupled; rewrite should shrink rather than add a second path. |
| `suppression_justification_checker.py` | 393 lines; duplicated recursive `_subscript_contains_any` logic (`:186-210`) | Can simplify with `nodes_of_class`/visitor; preserve W9704 locations exactly. |
| `runner/cli.py` | 379 lines; `too-many-locals` 23/20 | Split `_run_tool_pipeline`; remove duplicated skip logic? |
| `runner/cmd_build.py` | 291 lines; config flag map and statistics flag map | Add `ruff format` deliberately, not accidentally. |

## 7. Open questions & uncertainties

1. **What exactly does “never test linting” mean?** Does the golden/integration suite count as forbidden linting tests, or is the rule “do not add tests merely to satisfy lint; test infrastructure and third-party assumptions first”? This changes whether `tests/integration.py`/`test_golden.py` are retained, slimmed, or expanded.
2. **Semantic model choice and runtime.** Is a production runtime model allowed (optional extra with torch/transformers), or should the model run only offline to populate a tracked cache? Is GLiDE-0.4B required, or is a 150M Apache-2.0 decision model acceptable? No CPU benchmark exists for either model in this environment; GPU cards are the only published latency numbers.
3. **License acceptance.** GLiDE’s Fastino Community License has commercial-production and revenue thresholds and notice requirements; this repo is MIT. Is an optional dependency under that license acceptable to consumers, or should the implementation prefer Apache-2.0 models and vendor only Apache-2.0 inference code?
4. **Cache semantics.** Git-stored cache location, schema, key (full digest? include model revision/prompt version? include code_context or only comment+rule?), cleanup policy (age/run count/size), update command, CI guard, and whether normal lint is allowed to write it. Current cache ignores cleanup entirely.
5. **Threshold/evaluation set.** Existing threshold is 0.5 with no evaluation. The repo only has ~80 labelled heuristic comments plus real suppressions; is that enough to calibrate? Should the model only *veto* heuristic-accepted comments (conservative) or replace the heuristic entirely?
6. **Backward compatibility.** Keep `PYTHON_SETUP_LINT_SEMANTIC` and `PYTHON_SETUP_LINT_RERANKER_MODEL` names, add new model/version env vars, or rename the extra from `[semantic]` to something else? Docs/README/AGENTS/CHANGELOG all reference the reranker.
7. **Ruff format/tool-count contract.** Fix the six tests to 14 tools and add `ruff format` config/`--check`, or remove `ruff format` from `TOOLS`? If retained, should the normal lint pass check formatting (read-only) while `--fix`/phase 1a formats? Is `ruff format` a “lint tool” for docs/statistics?
8. **Red baseline ownership.** Fix `SIM102` (`coverage.py:196`) and `too-many-locals` (`cli.py:50`) as part of this iteration, or restore a baseline? The intent says enforce rules, so refactoring is the aligned choice. Also decide whether detect-secrets should exclude factory runtime journals in factory worktrees (environmental false positive).
9. **Behavior-preservation boundary.** The golden snapshot is generated with `PYTHON_SETUP_LINT_SEMANTIC=0`; therefore no current test pins semantic-model behavior. What is the authoritative behavior contract for W9704 when the model is absent, cache-hit, cache-miss, or model-load fails? Must existing checker findings line/col/message stay byte-identical?
10. **Stub/API surface.** New model code must update `_semantic.pyi`, possibly add a public cache-refresh entry point, and satisfy `mypy.stubtest`/pylint-pyi. Tests currently import private `_reset_cache`/`_load_reranker`; should those become explicit test seams or be moved to a dedicated maintenance API?
11. **Packaging and data files.** A git-tracked cache/model manifest must be included in the wheel; current hatch config only force-includes `config/` and `CodingRules.md` (`pyproject.toml:44-46`).
12. **De-scoping risk.** `docs/adr/ADR-004.md` describes a 28.6k-LOC, 184-file modernization across three workstreams. This context pack shows the codebase is smaller today (~8.9k src / ~18.4k test LOC) and prior waves already added golden/assumption tests; confirm the remaining scope rather than assuming the original 184-file estimate.

## 8. Suggested spike outlines (for architect)

1. **Model evaluation spike (no repo edit):** assemble a labelled set from `test_semantic_threshold.py` + `test_semantic_check.py` patterns + real repo suppressions; score `tasksource-decider-nano` (CPU) and `GLiDE-0.4B` if obtainable; report precision/recall at thresholds 0.5/0.6/0.7 and CPU latency. Decide model only after data.
2. **Cache spike:** design a tracked JSON schema (version, model id/revision, prompt hash, full digest key, boolean, last-seen), implement prune policy, and prove deterministic W9704 on a temp copy with model absent/present/cache-hit.
3. **Runner contract spike:** prove the intended `ruff format` behavior with `--check` vs `--fix`; add config flag; then update the 14-tool tests/docs in one place.
4. **Debloat spike:** measure test duplication by file/class and pick a target (e.g., merge 3 baseline-diff files, merge semantic heuristic tests, split factories) with a runtime/LOC target while keeping integration+golden green.
`). Read code ONLY to verify a specific architectural decision (few targeted reads, never broad scans or chunked whole-file reading). Do not investigate open-ended questions in code; translate unknowns into explicit uncertainties or spike outlines (`fact-finder`, `poc`, `test-assumptions`). Keep terse.
- Milestone count within the configured limit (see `{
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
}`).
- Scenarios & interfaces: each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
- Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
- Advisory sizing hint: give each item outline an explicit `prodBudgetHint` (estimated prod lines changed) as a sizing reference for review against `storyMaxProdLines`/`simpleMaxProdLines` in `{
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
}`.
- Infrastructure & quality gates: review declared gates, baseline status, and notes in `setup:
  - uv sync
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
  - id: test
    command: uv run pytest -q
  - id: test-integration
    command: uv run pytest tests/integration.py -q
testRunner:
  command: uv run pytest
  selectorArgs:
    - -k
  junitArg: --junitxml={path}
notes:
  - "CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff
    format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by
    cmd_build._build_command) runs plain `ruff format` with neither `--check`
    nor `--config`, so every invocation silently rewrites 105 files using ruff's
    default line-length instead of config/ruff.toml. Verified live (worktree
    went dirty with 106 modified files, then reverted; final state clean).
    Declared gates therefore split it: `format` = `ruff format --check --config
    config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the
    runner with the 13 check-only tools (mutation-free, verified clean
    afterwards). Operator action: add `--check` (+ `--config`) to the `ruff
    format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run
    lint` stops mutating worktrees."
  - "Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6
    failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume
    13 tools while TOOLS now has 14 (`ruff format` added):
    test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_pr\
    esent, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates,
    test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_cov\
    ered,
    test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given\
    _all_tools_then_have_parser,
    test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_t\
    ools_dispatched], ::[package_name_none_skips_stubtest_verifytypes]."
  - "Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at
    src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi
    W9704 unjustified-suppression at
    src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40
    and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at
    src/python_setup_lint/runner/cli.py:50; pylint tests C0208
    use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All
    other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright
    check, pyright verify types, detect-secrets)."
  - "Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked
    slow)."
  - 'Orchestration-folder noise: none — .factory is already excluded by project
    configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach
    exclude "**/.factory"); namespaced --tools list is required because `lint
    --exclude` is only forwarded to tools declaring supports_exclude
    (yamllint/mypy would still scan it). Note the `lint --tools` list must be
    updated if tool names change (unknown names fail loudly with
    ExtraToolsConfigError).'
  - lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves
    identically to plain mode; the pre-commit hook runs `lint --fix --baseline
    lint.baseline` (autofix is courtesy, opt out via
    PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a
    gate.
  - "Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with
    all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv`
    are gitignored build artifacts, so gate runs leave tracked files untouched.
    Test runner selector/junit verified: `uv run pytest -q -k <name>
    --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the
    currently-failing test."


# Infra Operator Action Notes
- CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by cmd_build._build_command) runs plain `ruff format` with neither `--check` nor `--config`, so every invocation silently rewrites 105 files using ruff's default line-length instead of config/ruff.toml. Verified live (worktree went dirty with 106 modified files, then reverted; final state clean). Declared gates therefore split it: `format` = `ruff format --check --config config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the runner with the 13 check-only tools (mutation-free, verified clean afterwards). Operator action: add `--check` (+ `--config`) to the `ruff format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run lint` stops mutating worktrees.
- Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6 failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume 13 tools while TOOLS now has 14 (`ruff format` added): test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_present, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered, test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser, test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], ::[package_name_none_skips_stubtest_verifytypes].
- Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi W9704 unjustified-suppression at src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40 and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at src/python_setup_lint/runner/cli.py:50; pylint tests C0208 use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, detect-secrets).
- Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked slow).
- Orchestration-folder noise: none — .factory is already excluded by project configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach exclude "**/.factory"); namespaced --tools list is required because `lint --exclude` is only forwarded to tools declaring supports_exclude (yamllint/mypy would still scan it). Note the `lint --tools` list must be updated if tool names change (unknown names fail loudly with ExtraToolsConfigError).
- lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves identically to plain mode; the pre-commit hook runs `lint --fix --baseline lint.baseline` (autofix is courtesy, opt out via PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a gate.
- Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv` are gitignored build artifacts, so gate runs leave tracked files untouched. Test runner selector/junit verified: `uv run pytest -q -k <name> --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the currently-failing test.

# Gates Baseline
timestamp: 2026-11-07T19:11:42.005Z
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
    status: pass
    durationMs: 154
    details: 173 files already formatted
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
    status: fail
    durationMs: 121850
    details: >-
      ============================================================

      [tach check] PASSED [0.3s]

      ============================================================

      Configuration

      [WARN] Warning: No first-party imports were found. You may need to use
      'tach mod' to update your Python source roots. Docs:
      https://docs.gauge.sh/usage/configuration#source-roots

      ✅ All modules validated!


      ============================================================

      [ruff check] FAILED (exit=1) [0.0s]

      ============================================================

      src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single
      `if` statement instead of nested `if` statements

      Found 1 error.

      No fixes available (1 hidden fix can be enabled with the `--unsafe-fixes`
      option).


      ============================================================

      [rumdl check] PASSED [0.0s]

      ============================================================


      Success: No issues found in 16 files (14ms)


      ============================================================

      [mypy] PASSED [5.7s]

      ============================================================

      Success: no issues found in 56 source files


      ============================================================

      [yamllint] PASSED [0.2s]

      ============================================================


      =================================================

      ... [truncated 1956 bytes] ...


      ============================================================

      [pylint-pyi] FAILED (exit=8) [9.4s]

      ============================================================

      ************* Module python_setup_lint.runner.cli

      src/python_setup_lint/runner/cli.py:50:0: R0914: Too many local variables
      (23/20) (too-many-locals)


      --------------------------------------------------------------------

      Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)



      ============================================================

      [pylint tests] FAILED (exit=16) [13.8s]

      ============================================================

      {
          "messages": [
              {
                  "type": "convention",
                  "symbol": "use-sequence-for-iteration",
                  "message": "Use a sequence type when iterating over values",
                  "messageId": "C0208",
                  "confidence": "HIGH",
                  "module": "tests.runner._factories_extras",
                  "obj": "<lambda>",
                  "line": 383,
                  "column": 82,
                  "endLine": 383,
                  "endColumn": 123,
                  "path": "tests/runner/_factories_extras.py",
                  "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize/tests/runner/_factories_extras.py"
              }
          ],
          "statistics": {
              "messageTypeCount": {
                  "fatal": 0,
                  "error": 0,
                  "warning": 0,
                  "refactor": 0,
                  "convention": 1,
                  "info": 0
              },
              "modulesLinted": 67,
              "score": 9.99827198894073
          }
      }


      ============================================================

      [detect-secrets] PASSED [7.7s]

      ============================================================


      [pylint] Using rcfile:
      /home/slava/aiexp/python-setup.factory-wt/topic_modernize/config/.pylintrc
  - id: test
    command: uv run pytest -q
    status: fail
    durationMs: 62789
    details: >-
      [Tach] 1328 tests in 54 files unaffected by changes (~29.4s could be
      saved). Skip with: pytest --tach

      [Tach] To disable: pytest -p no:tach
      (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)

      ........................................................................
      [  5%]

      ........................................................................ [
      10%]

      ..............................................................ssss...... [
      16%]

      ........................................................................ [
      21%]

      ........................................................................ [
      27%]

      ........................................................................ [
      32%]

      ........................................................................ [
      38%]

      ........................................................................ [
      43%]

      ........................................................................ [
      49%]

      ........................................................................ [
      54%]

      ........................................................................ [
      60%]

      ...........................................................FF........... [
      65%]

      ........................................................................ [
      71%]

      ..............................................................F......... [
      76%]

      ..

      ... [truncated 17052 bytes] ...

      6 failed, 1300 passed, 4 skipped, 18 deselected, 4 warnings in 26.01s
    failingTests:
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
      - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
      - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched]
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
  - id: test-integration
    command: uv run pytest tests/integration.py -q
    status: pass
    durationMs: 36532
    details: |-
      [Tach] 9 tests in 3 files unaffected by changes (~42.4s could be saved). Skip with: pytest --tach
      [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
      .........                                                                [100%]
      9 passed in 35.70s`. If any gate mutates the worktree (`mutatesWorktree: true`) or has operator action notes (e.g. linter scanning orchestration folder), account for it in your plan (e.g. adding check flags, excluding folders, or addressing via tech debt/spikes).
- Status grounding (iterations > 1): the `Task Status` block below is derived from committed records + git. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the plan matching `plan.schema.json`.

## Task & Iteration
Task: modernize
Iteration: 2

## Intent
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


## Context Pack
# Context Pack — `modernize`

> Repository: `python-setup` v1.2.10, `requires-python = "3.14"` (`pyproject.toml:1-5`). Worktree: `topic_modernize`. Working tree was clean at HEAD except factory journal state. Source is ~8,890 LOC of Python; tests are ~18,401 LOC with 772 `test_*` functions.

## 0. Executive snapshot — current gates are NOT green

These are measured facts the architect must plan around; they are independent of the `modernize` intent but any behavior-preserving refactor starts here.

| Gate | Current result | Evidence |
|---|---|---|
| `uv run pytest -q` | **6 failed, 1334 passed, 4 skipped, 18 deselected**, ~30 s | Run on HEAD. All 6 failures are stale 13-tool assumptions vs the 14-entry `TOOLS` table. |
| `uv run pytest tests/integration.py -q` | **9 passed**, ~65 s | Golden/integration gate passes today. |
| `uv run lint` | **not green**; two product violations are masked by an empty baseline; detect-secrets also flags tracked factory journal files in this worktree | `ruff check` → `SIM102` at `src/python_setup_lint/checkers/stub/coverage.py:196-198`; `pylint` → `too-many-locals` (23/20) at `src/python_setup_lint/runner/cli.py:50`; `lint.baseline:1` is `[]`. |
| `uv run lint` side effect | **mutates the worktree**: `ruff format` is run in the normal lint pass without `--check` and without the shipped ruff config; with the default config 109 files would be reformatted, while with `config/ruff.toml` all 179 files are already formatted | `dispatch.py:40-48`; `cli.py:118-153`; `cmd_build.py:108-123`; `config/ruff.toml:1` |

**Critical mismatch:** `TOOLS` now has 14 entries including `ruff format` (`src/python_setup_lint/runner/dispatch.py:38-129`), but many tests/docs still assert 13:
- `tests/runner/test_lint_runner.py:49-76` (`len(...) == 13`; expected set omits `ruff format`).
- `tests/runner/_factories_extras.py:374-382` (`len(f.calls) == 13`, id `all_13_tools_dispatched`).
- `tests/runner/test_lint_runner_stats.py:72-74` and `tests/runner/test_t3_coverage.py:52-58` require every `TOOLS` entry to have a statistics parser; `ruff format` intentionally has none.
- Failing tests: `test_tool_spec_given_known_tools_then_present`, `test_tool_spec_given_tools_then_autofix_and_no_duplicates`, `test_statistics_parsers_given_all_tools_then_covered`, `test_parser_completeness_given_all_tools_then_have_parser`, and both `test_run_lint_with_fake_dispatch_invariants[...]` rows.
- Docs also say 13: `AGENTS.md:9,43,63,92-93`; `src/python_setup_lint/runner/cli.py:314`.

Commit `db5799d` (factory consolidation) changed test expectations from 14 back to 13 and emptied `lint.baseline` without fixing the two underlying violations; that is the source of the red baseline. `AGENTS.md:91` still claims 1290 pass/4 skip/15 deselected; measured is 1334/4/18.

## 1. Module map

| Area | Files | Responsibility |
|---|---|---|
| Checker framework | `src/python_setup_lint/checkers/_base.py` (238 lines), `_semantic.py` (189), `_semantic.pyi` | Shared message factory, source-root/path helpers, `check_if_meaningful`; optional semantic scorer. |
| Conformance checkers | `src/python_setup_lint/checkers/conformance/*.py` (15 checkers) | Pylint plugins enforcing CodingRules: beartype, no-try-import, asyncio-timeout, tmp-path, structlog, error-chain, trivial-wrapper, redundant-type-guard, bare-except-comment, missing-return-annotation, silent-except, suppression-justification, pyi-underscore, unnamed-tuple-dict, generic-key-dict. Registered via `config/.pylintrc:7` and `config/.pylintrc-tests:24`. |
| Stub checkers | `src/python_setup_lint/checkers/stub/*` (checker, coverage, docstring, fidelity/orchestrator, annotation, signature, kind, normalizer, import_contract) | Enforce `.pyi` presence/fidelity and docstring location/`Returns:` rules. |
| Runner | `src/python_setup_lint/runner/*` | 14 `ToolSpec`s (`dispatch.py:38-129`), command construction (`cmd_build.py`), sequential pipeline/autofix phases (`cli.py:50-153`), parsers (`parsers.py`, `_record_parsers.py`), baseline diff (`baseline.py`), output/statistics (`output.py`), config resolution (`_config.py`), extra tools (`extra_tools.py`). |
| Setup/install | `src/python_setup_lint/setup.py`, `_setup_precommit.py`, `_setup_pyproject.py`, `_setup_update.py` | Installs configs/symlinks/pre-commit in consumer projects. |
| Test utilities | `src/python_setup_lint/testing.py` | `_make_tc`, `_walk_and_release`, fake runner utilities used by checker/runner tests. |
| Golden contract | `tests/_golden.py` (423), `tests/test_golden.py` (341), `tests/data/golden/*.json` | Canonical findings snapshot: normalize/serialize/assert, update flag, per-tool minimums. |
| Assumptions | `tests/assumptions/test_{astroid,pylint,beartype}_contracts.py` | Pin third-party behavior before debloating (added by prior waves). |
| Sample oracle | `tests/data/minimal_sample_project/` | Planted violations; `violations.txt` lists every required rule; `tool_counts.json` pins per-tool minimums. |
| Docs/ADRs | `docs/semantic-justification.md`, `docs/custom-checks.md`, `docs/adr/ADR-001..004.md`, `AGENTS.md`, `CodingRules.md` | Current semantic contract, checker API, architecture decisions, project rules. |

### Runner data flow
`pyproject.toml`/`RunnerConfig` → `_select_tools` (`runner/_cli_complexity.py:41-56`) → `_run_tool_pipeline` (`cli.py:50-153`) → subprocess per tool → `LintResult` → parsers/statistics → baseline diff → report. With `--fix`, phase 1a formats, phase 1b fixes, phase 2 re-lints all tools (`cli.py:66-153`).

### W9704 data flow
`SuppressionJustificationChecker.visit_module` scans raw source lines (`suppression_justification_checker.py:43-91`) → trailing/preceding reason extraction (`:330-388`) → `check_if_meaningful` (`_base.py:142-238`) → semantic scorer if enabled, else heuristic → `add_message("unjustified-suppression")`. Any-annotation paths use the same helper (`suppression_justification_checker.py:126-184`). `BareExceptCommentChecker` also calls it (`bare_except_comment_checker.py:73-124`).

## 2. Key interfaces & signatures

### `check_if_meaningful` — `src/python_setup_lint/checkers/_base.py:142-158`
```python
@beartype
def check_if_meaningful(
    text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None
) -> bool:
    if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1":
        from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
        result = _semantic_check(text, rule=rule, code_context=code_context, comment=comment)
        if result is not None:
            return result
    # heuristic fallback: strips comment/text, rejects <5 chars, exact boilerplate/brush-off, rule-symbol-only
```

### `semantic_check_if_meaningful` — `src/python_setup_lint/checkers/_semantic.py:125-189`
```python
def semantic_check_if_meaningful(
    text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None
) -> bool | None:
    primary = (comment or text).strip()
    # cache key = first 8 bytes of SHA-256(text|rule|code_context|comment|model)
    # cache hit -> return stored bool
    reranker = _load_reranker()
    if reranker is None: return None          # caller falls back to heuristic
    query = " | ".join([f"rule: {rule}", f"context: {code_context[:200]}"]) or primary
    score = float(reranker.predict([(primary, query)])[0])
    result = score >= 0.5
    cache[key] = result; _save_result_cache(); return result
```

### Other critical symbols
- `ToolSpec` (`runner/types.py:1-30`): `name`, `command`, `supports_fix`, `supports_path`, `supports_exclude`, `default_paths`, `fix_flags`, `exclude_flag`, `timeout`, `memory_limit_mb`.
- `RunnerConfig`: pipeline inputs including `cwd`, `package_name`, `config_paths`, `tool_timeouts`, `tool_memory_limits`, `tools_override` (used at `_cli_complexity.py:41-56`).
- `LintResult`, `Record`, `ViolationCount` (`runner/types.py`, `_record_types.py`).
- `_reset_cache()`, `_load_reranker()`, `_RERANKER_UNAVAILABLE`, `_RERANKER_MODEL` (`_semantic.py:26-31,40-52,81-122`) — private test seams currently imported directly by tests.
- Env vars: `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`), `PYTHON_SETUP_LINT_RERANKER_MODEL` (default `jina-reranker-v2-base-multilingual`), `PYTHON_SETUP_LINT_NO_AUTOFIX`, `PYTHON_SETUP_LINT_FORCE_FIX`, `PYTHON_SETUP_LINT_UPDATE_GOLDEN` (`_semantic.py:49-52`; `_base.py:151`; `tests/_golden.py:51-52`).
- Checker registration: packaged as pylint plugins in `config/.pylintrc:7` / `.pylintrc-tests:24`; each module exposes `register(linter)`.

## 3. Relevant excerpts

### 3.1 Current semantic module is a cross-encoder reranker, not a decision model
- Module docstring states single-stage cross-encoder reranking, lazy load, `None` on failure (`_semantic.py:1-12`).
- Cache dir/model globals (`_semantic.py:37-52`):
```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get("PYTHON_SETUP_LINT_RERANKER_MODEL", "jina-reranker-v2-base-multilingual")
```
- Loader imports `sentence_transformers.CrossEncoder`, downloads to `_CACHE_DIR`, disables on `ImportError/OSError/RuntimeError/ValueError` (`_semantic.py:93-122`).
- Cache helpers load/save JSON mapping `str(key)->bool`; `_reset_cache` deletes the file (`_semantic.py:55-90`).
- All cache keys are truncated to 64 bits (`int.from_bytes(cache_key[:8], "big")`, `_semantic.py:155-157`) — collision risk and no schema/model-revision field beyond the model string.
- The optional extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); in the dev venv `sentence_transformers`, `torch`, and `transformers` are **not installed**, so today the semantic path returns `None` and the heuristic makes every decision. This matches `docs/adr/ADR-002.md:3`.

### 3.2 W9704 callers and message contract
- Message: `W9704`, symbol `unjustified-suppression`, text `"Suppression comment without technical justification: %s"` (`suppression_justification_checker.py:33-41`).
- Trailing reason logic checks every suppression match, takes text before the next suppression pattern, and calls `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:356-375`). Preceding-comment path at `:377-386`.
- Any-parameter/return path calls the same function on a trailing reason, else emits W9704 (`:136-162`).
- Bare-except checker calls it for trailing and preceding comments (`bare_except_comment_checker.py:98-122`).
- `check_if_meaningful` heuristic (`_base.py:160-238`) rejects empty/`<5` chars, a large exact boilerplate set (including `pre-existing`, `baseline`, `wip`, `temp`, `legacy`, `later`, `for now`, `carryover`), exact brush-off phrases, and a reason equal to the rule symbol. Matching is **exact-string**, not semantic.

### 3.3 Runner: 14 tools, formatter config gap
- `TOOLS` order: tach, **ruff format**, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets (`dispatch.py:38-129`).
- `ruff format` is `supports_fix=False`, `default_paths=["src/","tests/"]` (`dispatch.py:40-48`); phase 1a runs it before fix tools (`cli.py:72-85`), but the normal pass also runs it (`cli.py:118-153`). `_build_command` adds no `--check` (`cmd_build.py:288-305`).
- Shipped config mapping omits `ruff format` (`runner/_config.py:8-14`: only `ruff check` → `ruff.toml`); `_config_flag_for` also omits it (`cmd_build.py:108-123`). Result: `ruff format` uses defaults (line-length 88) instead of `config/ruff.toml` (line-length 130, `config/ruff.toml:1`). Verified with `ruff format --check`: shipped config = 179 already formatted; default config = 109 files would reformat.
- A correct fix likely: map `ruff format` to the ruff config, add `--config`, and run `--check` in non-fix mode (or exclude format from the normal pass). This is a design decision because `AGENTS.md:9` describes `uv run lint` as the 13-tool lint pipeline, while phase 1a needs a mutating formatter under `--fix`.
- Two real violations currently masked by `lint.baseline:1`:
  - `src/python_setup_lint/checkers/stub/coverage.py:194-198` nested `if` (`SIM102`).
  - `src/python_setup_lint/runner/cli.py:50` `_run_tool_pipeline` has 23 locals vs max 20 (`too-many-locals`); `config/.pylintrc:21-27` sets `max-locals=20`.

### 3.4 Golden behavior contract (prior wave)
- `tests/integration.py:116-200` runs the full sample pipeline, asserts every `TOOLS` section appears, no crash/skip, W9705 fires, then collects findings on a pristine copy and compares to the committed multiset golden.
- `collect_findings` deliberately selects only tools with a record parser (`tests/_golden.py:202-247`), so formatter/statistics-only tools do not mutate or pollute line numbers.
- Golden file: `tests/data/golden/minimal_sample_project_findings.json` (21,783 bytes; 18 W9704 entries across pylint/pylint-pyi/pylint tests) and `..._tool_counts.json` (14 keys including `"ruff format": 0`).
- Oracle rules: `tests/data/minimal_sample_project/violations.txt`; helper `assert_oracle_coverage` (`tests/_golden.py:412-416`) and `assert_tool_coverage` (`:419-423`).
- Update guard: `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`; refuses to rewrite under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:372-388`; `tests/test_golden.py:242-283`).
- Integration forces `PYTHON_SETUP_LINT_SEMANTIC=0` for the snapshot (`tests/integration.py:173-174`), so the golden does **not** currently exercise the semantic model path. Any model swap needs an additional deterministic (cache-hit/no-network) semantic test.

### 3.5 CodingRules sections that drive the modernization
- Simplification: remove redundant wrappers/checks/fallbacks, extract duplicated logic, prefer direct approaches (`CodingRules.md:90-107`).
- Complexity enforced, not baselined: `max-branches=16`, `max-statements=65`, `max-module-lines=500`; over-limit modules must be split (`CodingRules.md:139-159`; `config/.pylintrc:1-3,21-27`).
- Tests: mock only external boundaries; verify third-party assumptions in dedicated tests; optimize test LoC/complexity; prefer long end-to-end scenario tests with intermediate assertions; parametrize; golden snapshots; factories; independent tests; naming `test_<method>_given_<condition>_then_<expected>`; shared fixtures only in conftest (`CodingRules.md:230-306`).
- Typing/stubs: `.pyi` required for all non-`__init__` modules; expose public members only; docstrings belong in `.pyi` (`CodingRules.md:35-67`). `_semantic.pyi:1-27` currently mirrors only the public function.

## 4. Existing tests & conventions

### Layout and selection
- Checker tests: `tests/checkers/` (25 files). Runner tests: `tests/runner/` (30 files). Integration: `tests/integration.py`. Assumptions: `tests/assumptions/`. Golden helpers: `tests/_golden.py` + `tests/test_golden.py`.
- `pyproject.toml:48-55`: default `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail`.
- `tests/conftest.py:30-35` puts `.venv/bin` on PATH for subprocess tools; `:62-89` session-scoped `configured_project`; `:93-123` `tmp_baseline`/`runner_config_factory`; `:170-178` `shipped_config_paths`.
- Checker tests use `_make_tc_factory` from `src/python_setup_lint/testing.py` and shared data/factories in `tests/checkers/_factories.py` (1,393 lines; `# pylint: disable=too-many-lines` at line 15).
- Runner tests use `tests/runner/_factories.py` (canned results, fake runner, baseline helpers), `_factories_extras.py` (502 lines; duplicate `too-many-lines` disables at lines 1 and 6), `_factories_tables.py` (394 lines).

### Semantic/justification test surface (prime debloat + rewrite target)
- `tests/checkers/test_semantic_check.py` — 506 lines, 19 tests, `too-many-lines` disable at line 1. Includes:
  - `TestImportErrorFallback` (`:20-42`) patches `builtins.__import__` to make `_semantic` unimportable and asserts `ImportError` propagates; this tests an infrastructure assumption, not product behavior.
  - `TestDefaultUserFallback` (`:48-77`) patches `_load_reranker` to `None`.
  - `TestRerankerImportFallback` (`:83-153`) asserts sentinel prevents retry storm.
  - `TestBrushOffPatterns` (`:159-209`) and `TestMeaningfulPatterns` (`:212-257`) duplicate the heuristic patterns also covered by `test_semantic_threshold.py`.
  - `TestSemanticCheck` (`:263-418`) has permissive assertions (`None or isinstance(bool)`, `False or None`) and a `@pytest.mark.slow` download test.
  - `TestRerankerPairs` (`:424-506`) encodes the cross-encoder contract; all four tests use `importorskip` and permissive assertions.
- `tests/checkers/test_semantic_threshold.py` — 138 lines; two parametrized tests over 30 meaningful + 50 meaningless comments with `PYTHON_SETUP_LINT_SEMANTIC=0`; overlaps the heuristic pattern tests above.
- `tests/checkers/test_suppression_justification_checker.py` — 390 lines, 42 tests. `TestSuppressionRerankerPipeline` (`:357-390`) is `@pytest.mark.slow`, `importorskip("sentence_transformers")`, and tests only two comments through the full checker.
- Private imports from `_semantic` carry repeated `# type: ignore[attr-defined]` comments (e.g. `test_semantic_check.py:53,67,91,136,325,434`), evidence that the module API/test seam needs redesign.

### Runner test duplication candidates
- Baseline diff split across `tests/runner/test_baseline_diff.py` (321 lines), `test_baseline_diff_edge.py` (504), `test_baseline_diff_parsers.py` (553) — overlapping `compare_sorted`/`diff_baseline`/parser coverage.
- Runner split across `test_lint_runner.py` (493 lines), `test_lint_runner_integration.py` (445), `test_lint_runner_stats.py` (377) — all three disable module-line limits and exercise the same `run_lint`/`build_command`/statistics paths.
- `tests/test_golden.py` (341 lines, 25 tests) unit-tests golden helper internals; `tests/_golden.py` is test infrastructure (423 lines). Decide whether helper-level tests are `implementation_detail` / worth retaining under the “test infra/assumptions first” rule.
- `tests/runner/test_parsers_hypothesis.py` (432 lines, 66 parametrized tests) uses hypothesis per CodingRules; likely keep unless coverage overlaps `test_baseline_diff_parsers.py`.
- `tests/integration.py` (661 lines, 9 tests) has `too-many-lines` disable; it is the key fit-for-purpose gate and should stay, but helper duplication was already a prior consolidation target.
- Tests import test-data factories with `Any` and many `# pylint: disable` comments; these are intentional, not necessarily violations.

## 5. Model replacement research — facts for the architect/spike

### Current problem restated
`_semantic.py` uses `sentence-transformers` + a cross-encoder (`jina-reranker-v2-base-multilingual`) with a 0.5 threshold. The dependency is optional and absent in dev/CI; model download failures are swallowed; results are cached per machine in `~/.cache/python-setup/semantic/results.json` (gitignored, unbounded, 64-bit truncated keys). `docs/adr/ADR-002.md` and `ADR-003.md` already state the intent: CPU-friendly small decision model + git-stored self-cleaning cache.

### Candidate models (verified from model cards/API)
| Candidate | Size / weights | CPU / deps | License | Decision-index evidence | Fit / risk |
|---|---|---|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B params, 0.81 GB bf16 | Model card tested on CUDA only; `glide` package pins `torch==2.14.0`, `transformers==5.17.0`; bf16 weights; 8k context; one forward pass per question | **Fastino Community License** (commercial production restrictions >$10M revenue; notice requirements) | 51.10 public suite; family blog: 0.4B Full 33.84, 7 ms median on RTX PRO 6000 | Accuracy ceiling per intent but not proven CPU-friendly; heavy dependency; license must be reviewed for an MIT package |
| `tasksource/tasksource-decider-nano` | 149M params, BF16, ModernBERT cross-encoder | `decider.py` defaults device to `cuda` if available else **CPU**; PyTorch + transformers + safetensors + huggingface_hub; 8,192-token limit, no truncation | **Apache-2.0** | #1 under 300M on Decision Index 0.4 (Full 19.85); public 0.3 index 33.51; 23 ms median on A30 | Best low-license CPU candidate; generic decision model, not trained specifically on code-review justifications; needs threshold calibration |
| `hotchpotch/bekko-system-one-v0-17m` | 16.8M params; ONNX browser model ~29 MB | CPU via sentence-transformers `BekkoSentenceTransformer`, SDPA; `torch>=2.10,<2.11`, `transformers==5.17.0`, `sentence-transformers==6.1.0`; `trust_remote_code` | No license declared in model card | S1MB 27.57 vs Jev 1.13 59.59; authors warn limited generalization | Very small/fast and ONNX option, but accuracy risk and unclear license |
| `Elfsong/jev-ettin-150m-v16` | 149.6M params, F32 | Custom PyTorch inference code in repo; CPU possible | Apache-2.0 | No card score in API metadata | Viable alternate 150M; custom code/vendoring burden |
| `tardellirs/crivo-68m`, `codavidgarcia/mola-68m` | 68M | PyTorch/transformers | **CC-BY-NC-4.0** | Public/full index entries | Non-commercial license blocks use in an MIT tool; avoid |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | 22.7M | CPU-friendly | Apache-2.0 | Relevance reranker, not a decision model | Cheap fallback baseline; not calibrated for “meaningful justification” |

Sources: [GLiDE-0.4B card](https://huggingface.co/fastino/GLiDE-0.4B), [GLiDE license](https://huggingface.co/fastino/GLiDE-0.4B/raw/main/LICENSE), [GLiDE requirements](https://huggingface.co/fastino/GLiDE-0.4B/raw/main/requirements.txt), [GLiDE family blog](https://fastino.ai/blog/glide-decision-model-family), [tasksource-decider-nano](https://huggingface.co/tasksource/tasksource-decider-nano), [decider.py](https://huggingface.co/tasksource/tasksource-decider-nano/raw/main/decider.py), [bekko-17m](https://huggingface.co/hotchpotch/bekko-system-one-v0-17m), [Elfsong-150m API](https://huggingface.co/api/models/Elfsong/jev-ettin-150m-v16), [crivo-68m API](https://huggingface.co/api/models/tardellirs/crivo-68m), [mola-68m API](https://huggingface.co/api/models/codavidgarcia/mola-68m), [JEV decision index](https://huggingface.co/spaces/multimodalart/jev-decision-index).

### Proposed decision-model call shape (needs spike validation)
`state = {comment, rule, code_context}`; question type `noul`: “Is this a specific technical justification for suppressing this lint rule, rather than a placeholder, deferral, or brush-off?”; criteria descriptions for true/false; threshold calibrated on the existing labelled comments plus real repo suppression comments. `tasksource-decider-nano` returns `{"answers": {"meaningful": {"type": "noul", "noul": P(true)}}}` (`decider.py` `answer` method). GLiDE returns `{"answers": {qid: {"noul": P(true), "confidence": ...}}}`.

### Cache facts and open design space
- Current cache is per-machine and gitignored: `.gitignore:243-244` (`.cache/python-setup/semantic/`), `_semantic.py:37-47,55-90`.
- Legacy key includes `text|rule|code_context|comment|model`; first 8 bytes only; changing code context invalidates; stale entries never pruned.
- Git-tracked alternatives: a JSON/NDJSON file inside `src/python_setup_lint/` or a top-level cache dir. Packaging currently force-includes only `config/` and `CodingRules.md` (`pyproject.toml:44-46`), so any package-data cache needs hatch inclusion.
- Determinism requirement: W9704 must not differ between machines with/without the model. A tracked cache can serve as the source of truth; model runs only on cache miss or in an explicit refresh command. If lint writes the cache, lint becomes non-hermetic; safer to require an explicit `--update` / env flag and keep normal lint read-only.

## 6. Debloat / coding-rule enforcement inventory

| Target | Evidence | Notes / intent risk |
|---|---|---|
| Test suite volume | Tests ~18,401 LOC vs src ~8,890; 772 test functions; 6 failing | Debloat metrics need definition (LOC, test count, runtime, duplication). Preserve golden/integration intent. |
| `tests/checkers/_factories.py` | 1,393 lines; `too-many-lines` disable line 15 | Pure data; CodingRules says split over-500 modules. Could split by checker group. |
| `tests/runner/_factories_extras.py` | 502 lines; two overlapping `too-many-lines` disables at lines 1 and 6 | Duplicate disable comment itself is bloat. |
| `tests/integration.py` | 661 lines; `too-many-lines` disable line 12 | Prior consolidation inlined helper logic instead of reducing; keep behavior contract. |
| `tests/checkers/test_semantic_check.py` | 506 lines; `too-many-lines` disable line 1; 19 tests | Must be rewritten for the model swap; merge heuristic pattern tests with `test_semantic_threshold.py`; remove impossible `ImportError` propagation test. |
| `tests/checkers/test_semantic_threshold.py` | 138 lines; overlaps heuristic patterns | Keep as the labelled evaluation corpus; consolidate with semantic heuristic tests. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines / 42 tests; 2 slow reranker tests | Parametrize near-identical tests; move model-path coverage to new semantic test module. |
| Three baseline-diff test files | 321 + 504 + 553 lines | Merge into scenario-based tests around `diff_baseline`; keep edge/perf separately only if they protect distinct invariants. |
| Three runner test files | 493 + 445 + 377 lines; all `too-many-lines` disabled | Consolidate around `run_lint` scenarios; keep tool-registry invariant table one place. |
| `tests/test_golden.py` | 341 lines / 25 helper-unit tests | Tests test infrastructure; check whether each is `implementation_detail` and whether scenario coverage in `integration.py` already suffices. |
| `_semantic.py` / `_base.py` | 189 + 238 lines | Heuristic duplicated between semantic module and base; cache helpers and singleton globals are test-coupled; rewrite should shrink rather than add a second path. |
| `suppression_justification_checker.py` | 393 lines; duplicated recursive `_subscript_contains_any` logic (`:186-210`) | Can simplify with `nodes_of_class`/visitor; preserve W9704 locations exactly. |
| `runner/cli.py` | 379 lines; `too-many-locals` 23/20 | Split `_run_tool_pipeline`; remove duplicated skip logic? |
| `runner/cmd_build.py` | 291 lines; config flag map and statistics flag map | Add `ruff format` deliberately, not accidentally. |

## 7. Open questions & uncertainties

1. **What exactly does “never test linting” mean?** Does the golden/integration suite count as forbidden linting tests, or is the rule “do not add tests merely to satisfy lint; test infrastructure and third-party assumptions first”? This changes whether `tests/integration.py`/`test_golden.py` are retained, slimmed, or expanded.
2. **Semantic model choice and runtime.** Is a production runtime model allowed (optional extra with torch/transformers), or should the model run only offline to populate a tracked cache? Is GLiDE-0.4B required, or is a 150M Apache-2.0 decision model acceptable? No CPU benchmark exists for either model in this environment; GPU cards are the only published latency numbers.
3. **License acceptance.** GLiDE’s Fastino Community License has commercial-production and revenue thresholds and notice requirements; this repo is MIT. Is an optional dependency under that license acceptable to consumers, or should the implementation prefer Apache-2.0 models and vendor only Apache-2.0 inference code?
4. **Cache semantics.** Git-stored cache location, schema, key (full digest? include model revision/prompt version? include code_context or only comment+rule?), cleanup policy (age/run count/size), update command, CI guard, and whether normal lint is allowed to write it. Current cache ignores cleanup entirely.
5. **Threshold/evaluation set.** Existing threshold is 0.5 with no evaluation. The repo only has ~80 labelled heuristic comments plus real suppressions; is that enough to calibrate? Should the model only *veto* heuristic-accepted comments (conservative) or replace the heuristic entirely?
6. **Backward compatibility.** Keep `PYTHON_SETUP_LINT_SEMANTIC` and `PYTHON_SETUP_LINT_RERANKER_MODEL` names, add new model/version env vars, or rename the extra from `[semantic]` to something else? Docs/README/AGENTS/CHANGELOG all reference the reranker.
7. **Ruff format/tool-count contract.** Fix the six tests to 14 tools and add `ruff format` config/`--check`, or remove `ruff format` from `TOOLS`? If retained, should the normal lint pass check formatting (read-only) while `--fix`/phase 1a formats? Is `ruff format` a “lint tool” for docs/statistics?
8. **Red baseline ownership.** Fix `SIM102` (`coverage.py:196`) and `too-many-locals` (`cli.py:50`) as part of this iteration, or restore a baseline? The intent says enforce rules, so refactoring is the aligned choice. Also decide whether detect-secrets should exclude factory runtime journals in factory worktrees (environmental false positive).
9. **Behavior-preservation boundary.** The golden snapshot is generated with `PYTHON_SETUP_LINT_SEMANTIC=0`; therefore no current test pins semantic-model behavior. What is the authoritative behavior contract for W9704 when the model is absent, cache-hit, cache-miss, or model-load fails? Must existing checker findings line/col/message stay byte-identical?
10. **Stub/API surface.** New model code must update `_semantic.pyi`, possibly add a public cache-refresh entry point, and satisfy `mypy.stubtest`/pylint-pyi. Tests currently import private `_reset_cache`/`_load_reranker`; should those become explicit test seams or be moved to a dedicated maintenance API?
11. **Packaging and data files.** A git-tracked cache/model manifest must be included in the wheel; current hatch config only force-includes `config/` and `CodingRules.md` (`pyproject.toml:44-46`).
12. **De-scoping risk.** `docs/adr/ADR-004.md` describes a 28.6k-LOC, 184-file modernization across three workstreams. This context pack shows the codebase is smaller today (~8.9k src / ~18.4k test LOC) and prior waves already added golden/assumption tests; confirm the remaining scope rather than assuming the original 184-file estimate.

## 8. Suggested spike outlines (for architect)

1. **Model evaluation spike (no repo edit):** assemble a labelled set from `test_semantic_threshold.py` + `test_semantic_check.py` patterns + real repo suppressions; score `tasksource-decider-nano` (CPU) and `GLiDE-0.4B` if obtainable; report precision/recall at thresholds 0.5/0.6/0.7 and CPU latency. Decide model only after data.
2. **Cache spike:** design a tracked JSON schema (version, model id/revision, prompt hash, full digest key, boolean, last-seen), implement prune policy, and prove deterministic W9704 on a temp copy with model absent/present/cache-hit.
3. **Runner contract spike:** prove the intended `ruff format` behavior with `--check` vs `--fix`; add config flag; then update the 14-tool tests/docs in one place.
4. **Debloat spike:** measure test duplication by file/class and pick a target (e.g., merge 3 baseline-diff files, merge semantic heuristic tests, split factories) with a runtime/LOC target while keeping integration+golden green.


## Infrastructure
setup:
  - uv sync
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
  - id: test
    command: uv run pytest -q
  - id: test-integration
    command: uv run pytest tests/integration.py -q
testRunner:
  command: uv run pytest
  selectorArgs:
    - -k
  junitArg: --junitxml={path}
notes:
  - "CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff
    format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by
    cmd_build._build_command) runs plain `ruff format` with neither `--check`
    nor `--config`, so every invocation silently rewrites 105 files using ruff's
    default line-length instead of config/ruff.toml. Verified live (worktree
    went dirty with 106 modified files, then reverted; final state clean).
    Declared gates therefore split it: `format` = `ruff format --check --config
    config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the
    runner with the 13 check-only tools (mutation-free, verified clean
    afterwards). Operator action: add `--check` (+ `--config`) to the `ruff
    format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run
    lint` stops mutating worktrees."
  - "Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6
    failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume
    13 tools while TOOLS now has 14 (`ruff format` added):
    test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_pr\
    esent, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates,
    test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_cov\
    ered,
    test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given\
    _all_tools_then_have_parser,
    test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_t\
    ools_dispatched], ::[package_name_none_skips_stubtest_verifytypes]."
  - "Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at
    src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi
    W9704 unjustified-suppression at
    src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40
    and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at
    src/python_setup_lint/runner/cli.py:50; pylint tests C0208
    use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All
    other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright
    check, pyright verify types, detect-secrets)."
  - "Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked
    slow)."
  - 'Orchestration-folder noise: none — .factory is already excluded by project
    configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach
    exclude "**/.factory"); namespaced --tools list is required because `lint
    --exclude` is only forwarded to tools declaring supports_exclude
    (yamllint/mypy would still scan it). Note the `lint --tools` list must be
    updated if tool names change (unknown names fail loudly with
    ExtraToolsConfigError).'
  - lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves
    identically to plain mode; the pre-commit hook runs `lint --fix --baseline
    lint.baseline` (autofix is courtesy, opt out via
    PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a
    gate.
  - "Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with
    all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv`
    are gitignored build artifacts, so gate runs leave tracked files untouched.
    Test runner selector/junit verified: `uv run pytest -q -k <name>
    --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the
    currently-failing test."


# Infra Operator Action Notes
- CRITICAL — the documented gate `uv run lint` is NOT check-only: its `ruff format` ToolSpec (src/python_setup_lint/runner/dispatch.py, built by cmd_build._build_command) runs plain `ruff format` with neither `--check` nor `--config`, so every invocation silently rewrites 105 files using ruff's default line-length instead of config/ruff.toml. Verified live (worktree went dirty with 106 modified files, then reverted; final state clean). Declared gates therefore split it: `format` = `ruff format --check --config config/ruff.toml src tests` (passes, 173 files formatted) and `lint` = the runner with the 13 check-only tools (mutation-free, verified clean afterwards). Operator action: add `--check` (+ `--config`) to the `ruff format` ToolSpec, or drop it from TOOLS, so AGENTS.md/CONTRIBUTING's `uv run lint` stops mutating worktrees.
- Baseline is red on clean checkout (recorded as-is). `uv run pytest -q`: 6 failed, 1300 passed, 4 skipped, 18 deselected (~36s) — all 6 failures assume 13 tools while TOOLS now has 14 (`ruff format` added): test_lint_runner.py::TestToolSpec::test_tool_spec_given_known_tools_then_present, ::test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_lint_runner_stats.py::test_statistics_parsers_given_all_tools_then_covered, test_t3_coverage.py::TestParserCompleteness::test_parser_completeness_given_all_tools_then_have_parser, test_testing_fakes.py::test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], ::[package_name_none_skips_stubtest_verifytypes].
- Lint gate is red on clean checkout (exit 16, ~65s): ruff check SIM102 at src/python_setup_lint/checkers/stub/coverage.py:196; pylint + pylint-pyi W9704 unjustified-suppression at src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py:40 and src/python_setup_lint/testing.py:34; pylint R0914 too-many-locals at src/python_setup_lint/runner/cli.py:50; pylint tests C0208 use-sequence-for-iteration at tests/runner/_factories_extras.py:383. All other tools pass (tach, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, detect-secrets).
- Integration gate passes: 9 passed in ~43s (tests/integration.py, not marked slow).
- Orchestration-folder noise: none — .factory is already excluded by project configs (rumdl exclude ".factory/**", yamllint ignore "**/.factory/**", tach exclude "**/.factory"); namespaced --tools list is required because `lint --exclude` is only forwarded to tools declaring supports_exclude (yamllint/mypy would still scan it). Note the `lint --tools` list must be updated if tool names change (unknown names fail loudly with ExtraToolsConfigError).
- lint.baseline is `[]` (empty), so `--baseline lint.baseline` behaves identically to plain mode; the pre-commit hook runs `lint --fix --baseline lint.baseline` (autofix is courtesy, opt out via PYTHON_SETUP_LINT_NO_AUTOFIX=1). Never declare `uv run lint --fix` as a gate.
- Setup verified from scratch: `uv sync` bootstraps Python 3.14.4 venv with all dev deps (uv.lock committed). `.pyrightconfig-composed.json` and `.venv` are gitignored build artifacts, so gate runs leave tracked files untouched. Test runner selector/junit verified: `uv run pytest -q -k <name> --junitxml=<file>` writes valid JUnit XML (tests=1) and exits 1 on the currently-failing test.

# Gates Baseline
timestamp: 2026-11-07T19:11:42.005Z
gates:
  - id: format
    command: uv run ruff format --check --config config/ruff.toml src tests
    status: pass
    durationMs: 154
    details: 173 files already formatted
  - id: lint
    command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
      check,mypy.stubtest,pyright check,pyright verify
      types,pylint,pylint-pyi,pylint tests,detect-secrets'
    status: fail
    durationMs: 121850
    details: >-
      ============================================================

      [tach check] PASSED [0.3s]

      ============================================================

      Configuration

      [WARN] Warning: No first-party imports were found. You may need to use
      'tach mod' to update your Python source roots. Docs:
      https://docs.gauge.sh/usage/configuration#source-roots

      ✅ All modules validated!


      ============================================================

      [ruff check] FAILED (exit=1) [0.0s]

      ============================================================

      src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single
      `if` statement instead of nested `if` statements

      Found 1 error.

      No fixes available (1 hidden fix can be enabled with the `--unsafe-fixes`
      option).


      ============================================================

      [rumdl check] PASSED [0.0s]

      ============================================================


      Success: No issues found in 16 files (14ms)


      ============================================================

      [mypy] PASSED [5.7s]

      ============================================================

      Success: no issues found in 56 source files


      ============================================================

      [yamllint] PASSED [0.2s]

      ============================================================


      =================================================

      ... [truncated 1956 bytes] ...


      ============================================================

      [pylint-pyi] FAILED (exit=8) [9.4s]

      ============================================================

      ************* Module python_setup_lint.runner.cli

      src/python_setup_lint/runner/cli.py:50:0: R0914: Too many local variables
      (23/20) (too-many-locals)


      --------------------------------------------------------------------

      Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)



      ============================================================

      [pylint tests] FAILED (exit=16) [13.8s]

      ============================================================

      {
          "messages": [
              {
                  "type": "convention",
                  "symbol": "use-sequence-for-iteration",
                  "message": "Use a sequence type when iterating over values",
                  "messageId": "C0208",
                  "confidence": "HIGH",
                  "module": "tests.runner._factories_extras",
                  "obj": "<lambda>",
                  "line": 383,
                  "column": 82,
                  "endLine": 383,
                  "endColumn": 123,
                  "path": "tests/runner/_factories_extras.py",
                  "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize/tests/runner/_factories_extras.py"
              }
          ],
          "statistics": {
              "messageTypeCount": {
                  "fatal": 0,
                  "error": 0,
                  "warning": 0,
                  "refactor": 0,
                  "convention": 1,
                  "info": 0
              },
              "modulesLinted": 67,
              "score": 9.99827198894073
          }
      }


      ============================================================

      [detect-secrets] PASSED [7.7s]

      ============================================================


      [pylint] Using rcfile:
      /home/slava/aiexp/python-setup.factory-wt/topic_modernize/config/.pylintrc
  - id: test
    command: uv run pytest -q
    status: fail
    durationMs: 62789
    details: >-
      [Tach] 1328 tests in 54 files unaffected by changes (~29.4s could be
      saved). Skip with: pytest --tach

      [Tach] To disable: pytest -p no:tach
      (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)

      ........................................................................
      [  5%]

      ........................................................................ [
      10%]

      ..............................................................ssss...... [
      16%]

      ........................................................................ [
      21%]

      ........................................................................ [
      27%]

      ........................................................................ [
      32%]

      ........................................................................ [
      38%]

      ........................................................................ [
      43%]

      ........................................................................ [
      49%]

      ........................................................................ [
      54%]

      ........................................................................ [
      60%]

      ...........................................................FF........... [
      65%]

      ........................................................................ [
      71%]

      ..............................................................F......... [
      76%]

      ..

      ... [truncated 17052 bytes] ...

      6 failed, 1300 passed, 4 skipped, 18 deselected, 4 warnings in 26.01s
    failingTests:
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
      - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
      - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
      - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched]
      - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
  - id: test-integration
    command: uv run pytest tests/integration.py -q
    status: pass
    durationMs: 36532
    details: |-
      [Tach] 9 tests in 3 files unaffected by changes (~42.4s could be saved). Skip with: pytest --tach
      [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
      .........                                                                [100%]
      9 passed in 35.70s

## Tech Debt
s, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 partially delivered: M1 golden safety net confirmed
  functional (golden+counts committed, oracle/tool coverage, drift/regen
  helpers, 8 assumption tests pinned). M2 helper consolidation unmerged (no
  tests/_project_helpers.py; integration.py 661 lines with suppression vs <=500)
  and M3 audits lack committed evidence; these plus the audit-flagged M1
  interface drift fixes carry to iteration 2. Semantic epic not started by
  design (spawns on narrowed protocol once M2/M3 land). Task intent (rule
  enforcement, debloat, model swap) remains future scope. No operator blocker:
  remaining work is planned, sequenced, and resourced for next iteration."


--- Decision 001-item-golden-findings-snapshot.yaml ---
id: decision-golden-findings-snapshot-1794105920421
context: item
item: golden-findings-snapshot
afterRecord: 002-test-first-a2
decision: split
timestamp: 2026-11-08T02:45:20.421Z
rationale: "3/3 test-first attempts exhausted with empty diff and no failure
  log: item couples deterministic unit-testable helpers (None-safe key, POSIX
  normalize, Counter diff, CI guard) with a heavy 2x14-tool pipeline capture +
  golden commit + integration rewiring. Test-first cannot progress on the
  combined scope. Split isolates the pure-logic module with fast synthetic tests
  from the heavy integration wiring, each independently verifiable; preserves
  probe dep and bounded-src discipline."
text: Schedule golden-helpers-unit first (fast, no pipeline);
  golden-snapshot-wiring consumes it plus the probe spec. Wiring acceptance is
  baseline-relative (6 pre-existing 13-vs-14 failures persist; no new failures).
  Do not touch .factory records.
outlines:
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe
      mirroring _violation_sort_key; normalize_record (drop msg, relativize vs
      project, strip ./, backslash->/, as_posix, assert non-absolute); serialize
      (json.dump indent=2 sort_keys=True + trailing newline);
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn+rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo.
      Bounded src allowance ONLY if probe proved test-side insufficient:
      baseline.py relativize/sort + parsers.py|_record_parsers.py ordering, <=40
      added lines, determinism-only, reviewed diff in report. Acceptance: `uv
      run pytest tests/integration.py -v`, `uv run pytest tests/test_golden.py
      -q` pass; regen twice byte-identical; golden+counts byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture


--- Decision 002-item-golden-snapshot-wiring.yaml ---
id: decision-golden-snapshot-wiring-1794117253013
context: item
item: golden-snapshot-wiring
afterRecord: 004-qa-r1-a2
decision: accept-with-debt
timestamp: 2026-11-08T05:54:13.013Z
rationale: "QA rejected twice on red-test alone: test_setup_new_and_lint passes
  'without production code changes'. That is the CORRECT outcome here, not a
  defect — the probe verdict was test-side sufficient, so the item intentionally
  makes zero src/ changes (diff: tests/_golden.py +111, integration.py +61/-27,
  two new golden JSONs, violations.txt retained). No developer retry can satisfy
  fail-then-pass without fabricating a gratuitous src change, which the plan
  forbids. The item's sensitivity is proven instead by in-memory drift injection
  and golden equality. Split/escalate/abandon all wrong: scope is correct,
  implementation passed every other gate, and M1 is the iteration's critical
  path."
text: Merge golden-snapshot-wiring as-is. Do not add src changes to satisfy
  red-test. Downstream items (consolidate-v2, audits-v2) proceed against the
  committed golden; consolidate must keep golden+counts byte-identical. Future
  tests-only contract items should be flagged red-test-exempt at assignment.
debt: "RED-TEST WAIVED (gate inapplicable by design): golden-snapshot-wiring is
  a tests-only M1 contract item — probe verdict was test-side normalization
  sufficient, so the bounded src allowance was correctly NOT used and the diff
  touches only tests/_golden.py (+collect_findings), tests/integration.py
  wiring, and the two committed golden JSON files. Red-test (test must fail
  without src changes) cannot hold when zero src changes are the correct
  outcome. Compensating verification already in the item: drift injection on
  in-memory list copies proves assert_matches_golden detects add/drop drift;
  PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 regen-twice byte-identical proves
  determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
  lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
  checks passed. No src follow-up required."


--- Decision 003-amend-remove-consolidate-integration-helpers.yaml ---
id: decision-amend-remove-consolidate-integration-helpers
context: wave
item: consolidate-integration-helpers
decision: split
rationale: Amendment removed pending item consolidate-integration-helpers
timestamp: 2026-11-08T07:19:12.494Z


--- Decision 004-item-consolidate-integration-helpers-v3.yaml ---
id: decision-consolidate-integration-helpers-v3-1794126299869
context: item
item: consolidate-integration-helpers-v3
afterRecord: 002-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T08:24:59.869Z
rationale: "Both develop attempts rejected solely on tests-only: diff touches
  lint.baseline (+18/-1) outside test paths. Test work itself matches the
  outline (_project_helpers.py +210, integration.py +43/-218, conftest/_autofix
  import switches). Baseline edit is never valid here — lint.baseline stays []
  and acceptance is baseline-relative. Reverting that one file plus any
  unrelated test edits unblocks merge; no split/escalate needed."
text: "Retry granted. Fix in this order: (1) Revert lint.baseline to HEAD
  exactly (must read `[]`, `git diff -- lint.baseline` empty). NEVER run `uv run
  lint --overwrite-baseline` or bare `uv run lint` (ruff-format write hazard).
  (2) Restrict diff to tests/** only: keep _project_helpers.py (10 helpers),
  conftest.py/_autofix_helpers.py/integration.py per-consumer import switches,
  and integration.py line-budget moves (>=127 removed, <=500, no suppression).
  Revert any unrelated edits — especially tests/_golden.py behavior, tool-count
  assertions (test_lint_runner*, test_t3_coverage), factory logic, or anything
  beyond import migration. (3) Verify: `git diff --stat` shows only tests/**;
  `git diff -- tests/data/golden/` empty (byte-identical); `uv run pytest
  tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass;
  touched files ruff/format clean; pre-existing SIM102/R0914/C0208 + 6
  tool-count failures persist by design (do not fix, do not baseline). Record
  the golden diff check in the report."
persist: true


## Steering Directives
s, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 partially delivered: M1 golden safety net confirmed
  functional (golden+counts committed, oracle/tool coverage, drift/regen
  helpers, 8 assumption tests pinned). M2 helper consolidation unmerged (no
  tests/_project_helpers.py; integration.py 661 lines with suppression vs <=500)
  and M3 audits lack committed evidence; these plus the audit-flagged M1
  interface drift fixes carry to iteration 2. Semantic epic not started by
  design (spawns on narrowed protocol once M2/M3 land). Task intent (rule
  enforcement, debloat, model swap) remains future scope. No operator blocker:
  remaining work is planned, sequenced, and resourced for next iteration."


--- Decision 001-item-golden-findings-snapshot.yaml ---
id: decision-golden-findings-snapshot-1794105920421
context: item
item: golden-findings-snapshot
afterRecord: 002-test-first-a2
decision: split
timestamp: 2026-11-08T02:45:20.421Z
rationale: "3/3 test-first attempts exhausted with empty diff and no failure
  log: item couples deterministic unit-testable helpers (None-safe key, POSIX
  normalize, Counter diff, CI guard) with a heavy 2x14-tool pipeline capture +
  golden commit + integration rewiring. Test-first cannot progress on the
  combined scope. Split isolates the pure-logic module with fast synthetic tests
  from the heavy integration wiring, each independently verifiable; preserves
  probe dep and bounded-src discipline."
text: Schedule golden-helpers-unit first (fast, no pipeline);
  golden-snapshot-wiring consumes it plus the probe spec. Wiring acceptance is
  baseline-relative (6 pre-existing 13-vs-14 failures persist; no new failures).
  Do not touch .factory records.
outlines:
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe
      mirroring _violation_sort_key; normalize_record (drop msg, relativize vs
      project, strip ./, backslash->/, as_posix, assert non-absolute); serialize
      (json.dump indent=2 sort_keys=True + trailing newline);
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn+rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo.
      Bounded src allowance ONLY if probe proved test-side insufficient:
      baseline.py relativize/sort + parsers.py|_record_parsers.py ordering, <=40
      added lines, determinism-only, reviewed diff in report. Acceptance: `uv
      run pytest tests/integration.py -v`, `uv run pytest tests/test_golden.py
      -q` pass; regen twice byte-identical; golden+counts byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture


--- Decision 002-item-golden-snapshot-wiring.yaml ---
id: decision-golden-snapshot-wiring-1794117253013
context: item
item: golden-snapshot-wiring
afterRecord: 004-qa-r1-a2
decision: accept-with-debt
timestamp: 2026-11-08T05:54:13.013Z
rationale: "QA rejected twice on red-test alone: test_setup_new_and_lint passes
  'without production code changes'. That is the CORRECT outcome here, not a
  defect — the probe verdict was test-side sufficient, so the item intentionally
  makes zero src/ changes (diff: tests/_golden.py +111, integration.py +61/-27,
  two new golden JSONs, violations.txt retained). No developer retry can satisfy
  fail-then-pass without fabricating a gratuitous src change, which the plan
  forbids. The item's sensitivity is proven instead by in-memory drift injection
  and golden equality. Split/escalate/abandon all wrong: scope is correct,
  implementation passed every other gate, and M1 is the iteration's critical
  path."
text: Merge golden-snapshot-wiring as-is. Do not add src changes to satisfy
  red-test. Downstream items (consolidate-v2, audits-v2) proceed against the
  committed golden; consolidate must keep golden+counts byte-identical. Future
  tests-only contract items should be flagged red-test-exempt at assignment.
debt: "RED-TEST WAIVED (gate inapplicable by design): golden-snapshot-wiring is
  a tests-only M1 contract item — probe verdict was test-side normalization
  sufficient, so the bounded src allowance was correctly NOT used and the diff
  touches only tests/_golden.py (+collect_findings), tests/integration.py
  wiring, and the two committed golden JSON files. Red-test (test must fail
  without src changes) cannot hold when zero src changes are the correct
  outcome. Compensating verification already in the item: drift injection on
  in-memory list copies proves assert_matches_golden detects add/drop drift;
  PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 regen-twice byte-identical proves
  determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
  lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
  checks passed. No src follow-up required."


--- Decision 003-amend-remove-consolidate-integration-helpers.yaml ---
id: decision-amend-remove-consolidate-integration-helpers
context: wave
item: consolidate-integration-helpers
decision: split
rationale: Amendment removed pending item consolidate-integration-helpers
timestamp: 2026-11-08T07:19:12.494Z


--- Decision 004-item-consolidate-integration-helpers-v3.yaml ---
id: decision-consolidate-integration-helpers-v3-1794126299869
context: item
item: consolidate-integration-helpers-v3
afterRecord: 002-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T08:24:59.869Z
rationale: "Both develop attempts rejected solely on tests-only: diff touches
  lint.baseline (+18/-1) outside test paths. Test work itself matches the
  outline (_project_helpers.py +210, integration.py +43/-218, conftest/_autofix
  import switches). Baseline edit is never valid here — lint.baseline stays []
  and acceptance is baseline-relative. Reverting that one file plus any
  unrelated test edits unblocks merge; no split/escalate needed."
text: "Retry granted. Fix in this order: (1) Revert lint.baseline to HEAD
  exactly (must read `[]`, `git diff -- lint.baseline` empty). NEVER run `uv run
  lint --overwrite-baseline` or bare `uv run lint` (ruff-format write hazard).
  (2) Restrict diff to tests/** only: keep _project_helpers.py (10 helpers),
  conftest.py/_autofix_helpers.py/integration.py per-consumer import switches,
  and integration.py line-budget moves (>=127 removed, <=500, no suppression).
  Revert any unrelated edits — especially tests/_golden.py behavior, tool-count
  assertions (test_lint_runner*, test_t3_coverage), factory logic, or anything
  beyond import migration. (3) Verify: `git diff --stat` shows only tests/**;
  `git diff -- tests/data/golden/` empty (byte-identical); `uv run pytest
  tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass;
  touched files ruff/format clean; pre-existing SIM102/R0914/C0208 + 6
  tool-count failures persist by design (do not fix, do not baseline). Record
  the golden diff check in the report."
persist: true


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

## Task Status
iteration: 2
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup ref=consolidate-integration-helpers-v2 disposition=human-awareness: Assignment named this story sole AGENTS.md counts owner, but kind=test-only forbids non-test paths, so AGENTS.md was restored to base (1290 pass / 13 tools vs actual 1340 pass / 14 tools) and src/python_setup_lint/runner/cli.py:314 help ('all 13 tools') was correctly left untouched. Engine tests-only check passes. Needs a follow-up docs/prod story to update AGENTS.md counts and the cli help text. Separately, `uv run lint` stays red on pre-existing base failures (SIM102, R0914, C0208, orchestration-journal detect-secrets) outside this story's budget; all files touched here are ruff/format clean.
  - awareness-plan-1-cache-file-needs-awareness ref=plan-1 disposition=human-awareness: Committed file in every linted repo (incl. consumers) with reviewable diffs and possible branch conflicts. Weights 0.03-0.8GB in model cache with own licenses. Install docs must mention file. Architect decides now; operator should be aware of footprint and license review.
  - awareness-plan-1-human-cache-location ref=plan-1 disposition=human-awareness: Assumption + ADR-003 place git-stored cache at linted root for python-setup and consumers; weights stay in user cache. Adds one committed file per consumer, reviewable diffs, possible line-local merges, must pass detect-secrets. Architect can proceed; operator should be aware before epic implements.
  - awareness-plan-1-human-material-definition ref=plan-1 disposition=human-awareness: Assumption defines material as findings {tool,file,line,col,rule} SEMANTIC=0 + checker units + CLI/exit + baseline/autofix + configs/scopes; model accept/reject non-material, heuristic rejections material. Makes preserve testable but narrows intent. Architect can proceed for iter1; record for operator review.
  - awareness-plan-1-human-never-lint-broadening ref=plan-1 disposition=human-awareness: Assumption expands never-test-linting to ban subprocess re-lint, AST/source re-implementation, and config-consistency re-checks (e.g. test_self_lint_clean.py slow gate, guards, config re-checks). M3 lists for removal, iter2 removes. Rationale (rot with rule churn) reasonable but deletes coverage; operator visibility warranted.
  - awareness-plan-1-material-definition-needs-awareness ref=plan-1 disposition=human-awareness: Assumption defines 4 limbs; reranker decisions not material, heuristic rejections material. Model 'only tightens acceptance' may add W9704 under default SEMANTIC=1 vs today heuristic-only. Architect decides now; operator should know tightening is intentional, not regression.
  - awareness-plan-1-never-linting-policy-needs-awareness ref=plan-1 disposition=human-awareness: Policy 'pytest never asserts lint-clean; lint gate does' removes self-lint guard running all 13 tools on repo. Trades pytest redundancy for gate reliance. Architect decides now; operator should know pytest -q alone will no longer catch self-lint regressions.

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1): Iteration number for this plan (minimum 1)
- milestones (array of object, required): Key delivery milestones for this iteration
  - id (string, required)
  - title (string, required)
  - scenarios (array of string, optional)
  - directionalInterfaces (array of string, optional)
  - replanAfter (boolean, optional)
- uncertainties (array of object, optional): Identified technical or domain uncertainties to resolve via spikes
  - id (string, required)
  - description (string, required)
  - spikeOutlines (array of string, optional)
- itemOutlines (array of object, required): Planned items/tasks to implement in this iteration
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - description (string, optional)
  - milestoneId (string, optional)
  - deps (array of string, optional)
  - escalate (boolean, optional)
  - replanAfter (boolean, optional)
  - prodBudgetHint (integer, optional, min: 0): Advisory sizing hint: architect's estimated production lines changed for this item, for review against storyMaxProdLines/simpleMaxProdLines. Never blocks or fails the plan.
- assumptions (array of object, optional): Key assumptions made during planning
  - assumption (string, required)
  - why (string, required)
  - disposition (string, optional)
- epics (array of object, optional): Child epics to spawn (root tasks only)
  - slug (string, required)
  - intent (string, required)
- techDebt (array of object, optional): Technical debt identified, categorized as adjacent, impacting, or blocking
  - id (string, required)
  - description (string, required)
  - category (string, required, enum: ["adjacent","impacting","blocking"])
  - resolution (string, optional)
- adrs (array of object, optional): Architecture Decision Records documented for major design choices
  - id (string, required)
  - title (string, required)
  - context (string, required)
  - decision (string, required)
  - consequences (string, optional)
