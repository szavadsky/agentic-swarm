# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify specific disputed claims or gate reports (few targeted reads, never broad scans). Keep terse.
- Decision options (yield `status` matching `plan-closeup.schema.json`):
  - `complete`: the task's `INTENT.md` is fully satisfied with verified working code, comprehensive tests, and green gates.
  - `next-iteration`: scope remains unfulfilled; proceed to iteration N+1 with updated requirements and hydrated context.
  - `blocked`: execution cannot proceed without human operator resolution. Formulate a precise, answerable `question` for the operator.
- Yield `{iteration, status, summary, question?, completedMilestones?, remainingMilestones?, techDebt?}`. Copy milestone/tech-debt lists from the audit when they still hold.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Rationale required: ground your decision in the plan close-up audit findings, verifying whether all milestones and Gherkin scenarios are genuinely delivered.

## Plan Close-Up Audit
{
  "iteration": 2,
  "status": "next-iteration",
  "summary": "M1 VERIFIED COMPLETE (repo): _RuffFormatLintTool with check-mode build_command (--check + --config resolved ruff.toml) and mutating build_format_command; cli.py phase-1a calls build_format_command, normal pass calls build_command; 'ruff format'->ruff.toml mapped in _config.py + _config_flag_for; registry invariants (EXPECTED_TOOL_NAMES/FORAMTTER_ONLY/STATISTICS/RECORD/RECORDLESS) owned by dispatch.py and re-exported via runner/__init__.py (+.pyi); 6 named tests migrated to 14/EXPECTED with FORMATTER_ONLY exemptions; docs per-hit migration verified (AGENTS 9,43,63,92,93; README 17,58; overlays 3; tutorials 26; troubleshooting 155; factories/extras; bench/smoke/fakes sites) with CHANGELOG:104 correctly staying 13; tool_counts.json has 14 keys incl 'ruff format':0; SIM102 combined-condition fix, cli.py locals split (_run_fix_phase/_select_lint_tools), C0208 sequence fix all present; lint.baseline is []; TestPipelineModes/TestRuffFormatStrategy assert check-only semantics. M2 VERIFIED COMPLETE (repo): 11 helpers defined exactly once in tests/_project_helpers.py with pinned signatures (mkdir-parents copy, test/test@test stage, rumdl-override idempotent config, -q bare init, msg='init' commit); conftest def deleted with both importers rewritten; no conftest/integration imports (cycle guard holds); stay-symbols untouched in _autofix_helpers.py; integration.py is 498 lines with both stale suppressions gone (too-many-locals globally disabled in .pylintrc-tests); collect_findings keeps tool order with sorting only in serialize/_diff_keys; caller asserts findings non-empty + [CRASH]-absent + SKIPPED-only-package_name; no __CRASH__ sentinel; UPDATE guard fails under CI; overlay test uses slice_tool_section('[pylint]','[pylint-pyi]'); temp-copy double-collect byte-identity asserted. M3 NOT VERIFIED / GAP: committed deliverable tests/assumptions/test_pylint_cache_semantics.py required by pylint-cache-assumptions is absent (tests/assumptions/ holds only pylint/astroid/beartype contract tests; the pylint lifecycle test pins open/close ordering but not writer identity, write timing, or --path scoping across the 3 pylint invocations); decision-runtime-pinning file status is conditional on the eval verdict and unverifiable from repo; model-matrix/eval/cache/secrets spikes are report-only by design. M4 NOT VERIFIABLE FROM REPO: both audits are zero-write by design with report tables as replan input; no committed map exists (consistent with ADR-008) but report completeness lives outside the repo audit boundary. This is a read-only audit: gate exit codes (format/lint/pytest/integration) were not executed and must be confirmed from engine gate results. Task intent (coding-rules enforcement, debloat, semantic swap) remains scheduled for iteration 3 per the plan; no semantic production code changed, as expected.",
  "completedMilestones": [
    "M1",
    "M2"
  ],
  "remainingMilestones": [
    "M3",
    "M4"
  ],
  "techDebt": [
    "M3 gap: tests/assumptions/test_pylint_cache_semantics.py missing; existing test_pylint_contracts.py does not pin writer/timing/--path scoping needed to derive the cache lock/merge/sweep design",
    "M3/M4 report deliverables (model matrix, CPU eval, cache design, pylint semantics verdict, runtime pinning, coding-rules + test-debloat audit tables) live in orchestration records outside the repo audit boundary; architect must confirm them before the iteration-3 replan",
    "AGENTS.md Tool Scope table lists 13 scoped tools and omits a ruff format row while the registry has 14 tools",
    "AGENTS.md Quick Commands test counts look stale (1290 pass / 7 pass; integration.py now has 9 test methods)",
    "Gate execution (format exit 0, zero lint violations, pytest + integration green) not verified by this read-only audit; confirm via engine gate results"
  ]
}

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


## Task Status
iteration: 2
amendments: 1
items:
  - runner-format-contract kind=dev wave=1 status=merged outlineRef=runner-format-contract
  - consolidate-integration-helpers-i2 kind=test-only wave=1 status=merged outlineRef=consolidate-integration-helpers
  - model-candidate-matrix kind=fact-finder wave=1 status=merged outlineRef=model-candidate-matrix
  - pylint-cache-assumptions kind=test-assumptions wave=1 status=running outlineRef=pylint-cache-assumptions
  - baseline-violations-fix kind=no-behavior wave=2 status=merged outlineRef=baseline-violations-fix
  - secrets-triage-spike kind=fact-finder wave=2 status=ready outlineRef=secrets-triage-spike
  - golden-contract-hardening kind=test-only wave=2 status=merged outlineRef=golden-contract-hardening
  - model-eval-poc kind=poc wave=2 status=merged outlineRef=model-eval-poc
  - cache-design-spike kind=poc wave=3 status=pending outlineRef=cache-design-spike
  - decision-runtime-pinning kind=test-assumptions wave=3 status=merged outlineRef=decision-runtime-pinning
  - coding-rules-audit-i2 kind=fact-finder wave=3 status=merged outlineRef=coding-rules-audit
  - test-debloat-audit-i2 kind=fact-finder wave=4 status=merged outlineRef=test-debloat-audit
  - remaining-lint-violations-fix kind=no-behavior wave=3 status=merged outlineRef=remaining-lint-violations-fix
waves: 1, 2, 3, 4
merged: runner-format-contract, consolidate-integration-helpers-i2, model-candidate-matrix, baseline-violations-fix, golden-contract-hardening, model-eval-poc, decision-runtime-pinning, coding-rules-audit-i2, test-debloat-audit-i2, remaining-lint-violations-fix
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

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
