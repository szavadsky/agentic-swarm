# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
test-debloat-audit-i2

## Assignment
{"slug":"test-debloat-audit-i2","kind":"fact-finder","title":"Inventory redundant tests and pinning limbs","assignment":"GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.","outlineRef":"test-debloat-audit","milestone":"M4","wave":4,"deps":["coding-rules-audit-i2","consolidate-integration-helpers-i2","golden-contract-hardening"],"scenarioRefs":["M4-2","M4-3"],"citations":["CodingRules.md:230-306","CodingRules.md:139-159","AGENTS.md:87-93","pyproject.toml:49-49","tests/checkers/test_semantic_check.py:1-7","tests/checkers/test_semantic_threshold.py:19-25"]}

## Prior Attempts & Failures
Fix rounds exhausted (2/3)

## Current Diff


## Review Feedback
Fix rounds exhausted (2/3) without resolution.

Latest fix requests:
- [FIX] Owner column abandons unified map 5-owner scheme: Unified map (.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml:82-88) defines exactly 5 owners: runner 67, checkers 83, setup-testing 15, semantic 4, root 15. r2 invents 10 tokens (tests-infra/baseline/autofix/configs/setup/golden/integration) and assigns e.g. test_suppression file to semantic. The inter-dep file EXISTS in-repo, so the uncertainty claim is false. Restore 5-owner column, 67/83/15/4/15 counts, and checkers-file/semantic-symbol split.
- [FIX] Per-module N/S counts systematically wrong (~25 files): Per-file --collect-only truth (default|slow): asyncio 15|0 vs 4, beartype 16 vs 5, generic-key 18 vs 2, missing-return 15 vs 4, no-try-import 14 vs 2, stub 54 vs 23, callable 36 vs 12, class 27 vs 9, coverage 57 vs 11, docstring 28 vs 8, normalizer 18 vs 4, unnamed 11 vs 2, autofix 25 vs 20, baseline-diff 15 vs 3, baseline-edge 16|2 vs 12|1, parsers 45 vs 6, config-consistency 11 vs 9, extra-tools 44 vs 21, extra-downstream 4|1 vs 3|1, lint-runner 58 vs 41, lint-integration 40|1 vs 19|1, stats 87 vs 29, setup 51 vs 31, setup-install 21|1 vs 7|1, t11 16|1 vs 17|1, golden 31 vs 30, semantic-check 82|3 vs 19|3, threshold 80 vs 2, suppression 40|2 vs 42|1, noise-filter 0|2 vs 2|2. r2 counts defs, not collected (parametrized) tests, violating its own N=default convention.
- [FIX] Pinning inventory drops ~14 blocking-debt limbs as pinned/omitted: Product flags exist with zero test pins: cli.py:292-296 --force-fix + PYTHON_SETUP_LINT_FORCE_FIX, :317-321 --format, :339-343 --cwd, :363-367 --config-status; grep tests for force-fix/config-status hits none; MAIN_ARGPARSE_CASES (_factories_tables.py:148-173) covers only path/fix/exclude/package-name/tools/default-py-dirs. Config gaps: _SHIPPED_CONFIG_FILES has 11 labels (_config.py:8-20) but t1b asserts 7-label subset (test_t1b_self_discovery.py:60-69); _config_flag_for mypy/rumdl/ty branches (cmd_build.py:108-124) only yamllint-tested; dispatch scopes ty src / pylint-pyi src / pylint-tests tests / tach whole-repo (dispatch.py:46-137), pyright tests/** exclusion (pyrightconfig.json:10-20), rumdl tests/data exclusion (rumdl.toml:3) have no direct pins. r1 listed ~15 blocking-debt limbs; r2 keeps only ty-scope. Restore all.
- [FIX] Repo-self-lint removal list incomplete (1 of 6 groups): Still present at HEAD: test_pyright_noise_filter.py:17-50 (module-slow, run_lint on repo_root), test_setup.py:326 TestModuleSizeGates, test_runner_private_imports.py:69 repo-AST scan, test_autofix_conflict_integration.py:44 TestRunLintFixDownstream (slow), test_setup_install.py:310-325 TestDownstreamIntegration (Path.home()/.tmp write), test_t9_7_compose_pyright_live.py:31 hardcoded /home/slava checkout. r2 keeps noise-filter/live as keep and omits the other four, claiming only self-lint is repo-self. List all six definite groups for removal with surviving gates (uv run lint, unit filter tests, integration.py).
- [FIX] Planned-path reservations omit epic conftest/assumption paths: plan-1.2.yaml:123-124,315-316 reserves tests/checkers/conftest.py (epic-created) and tests/assumptions runtime/decision/cache modules plus _decision_backend/_decision_cache; all verified absent at HEAD. r2 omits the conftest and assumption reservations and invents tests/runner/conftest.py, runner/runtime/, tests/runner/runtime/ with no plan citation, and mis-owns tests/conftest.py as tests-infra (unified map: root). Restore epic reservations verbatim.
- [FIX] Symbol exclusions drop check_if_meaningful and _OPTIONAL_IMPORT_PATTERNS: Unified map (output.yaml:85) lists semantic symbol exclusions inside checkers files: _base.py:143-238 check_if_meaningful (+_base.pyi:69-96) and conformance/no_try_import_checker.py:12 _OPTIONAL_IMPORT_PATTERNS. r2 section 4 drops both and mis-owns test_suppression_justification_checker.py as semantic (row 24) instead of checkers-file with TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. Restore both symbols and file/symbol separation.
- [FIX] Duplicate-cluster inventory regressed (helper/cluster merges lost): Verified at HEAD: _make_tc x13, _walk_and_release x10, _msg_ids x8 across tests/checkers; exact parser-completeness duplicate (test_t3_coverage.py:35-45 vs test_lint_runner_stats.py:72-77); autofix fake-branch vs real-git overlap; setup 6x install() in test_setup_install.py:263-266; _UvCallRecorder x2. r2 sets duplicate-of to -- for nearly all rows and replaces 7 r1 clusters with 4 merges, losing surviving-coverage mapping. Restore duplicate-of inventory or explicitly justify each dropped cluster.
- [FIX] Removing default pipeline smoke leaves no default full-pipeline pin: Default collect (1361/1379, 18 deselected) contains zero tests/integration.py rows (explicit-only 9-test gate), so test_real_pipeline_smoke.py (1 default test) is the sole default full-pipeline smoke. r2 removes it with survivor tests/integration.py:60-118 + :331-389, leaving no default full-pipeline pin. Keep the smoke or name a default-collected surviving pin.
- [FIX] Slow budget miscounts baseline-edge and suppression slow tests: TestPerfBenchmark (test_baseline_diff_edge.py:75-110) holds BOTH slow tests (:76 and :91); file truth is 16 default + 2 slow, but row 33 claims 12|1 and section 6.2 books 1 slow. Suppression truth is 40|2 but row 24 claims 42|1 (section 4 correctly says 2). Dropping bench(1)+self-lint(1)+perf-class(2)+extra-perf(1) yields 18->13, not 18->14. Recompute slow budget from slow truth table.
- [FIX] Integration runtime ~10-20s contradicts measured 106.61s: coding-rules-audit measured 9 passed in 106.61s (output.yaml:27); r1 reported ~65-107s explicit. r2 row 28 claims ~10-20s with no evidence, understating the explicit-gate cost ~5x for replan scheduling. Re-measure or restore 65-107s with measurement conditions (WSL2/Python 3.14.4/warm-cache +/-30%). Uncertainty: runtimes are environment-sensitive; self-lint exit-123 failure is worktree-state-sensitive.

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

## Output

Yield a structured JSON object matching this schema:
- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
- rationale (string, optional): Technical justification for this decision
- text (string, optional): Concrete guidance or steering directives
- persist (boolean, optional): Whether guidance persists across subsequent attempts
- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
- outline (object, optional): Item outline to schedule when decision is fix-item
- debt (string, optional): Technical debt description when decision is accept-with-debt
- reason (string, optional): Reason for abandonment or abort
- question (string, optional): Specific question for human operator when decision is human-async or blocked
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
