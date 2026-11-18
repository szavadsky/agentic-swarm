# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "runner/dispatch.py TOOLS[1]=ToolSpec('ruff format', ['ruff','format'], supports_fix=False, default_paths=['src/','tests/']); runner/_config.py maps 'ruff format'->'ruff.toml'; cmd_build._config_flag_for returns ['--config', path] and _build_command appends '--check' when not fix; cli.py phase 1a formats only under --fix, normal pass checks.",
        "Registry invariant single source: EXPECTED_TOOLS=frozenset(t.name for t in TOOLS) with len 14; RECORD_PARSER_TOOLS subset; FORMATTER_ONLY={'ruff format'} explicitly exempt from statistics-parser coverage; tests import it instead of hardcoding 13.",
        "Docs contract: AGENTS.md counts = runtime collect-only + len(TOOLS)==14; cli.py:314 help 'all 14 tools'; tool_counts.json keeps 14 keys including 'ruff format':0."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Gates green on clean checkout\n  Given clean HEAD with empty lint.baseline\n  When format, lint, `pytest -q`, and integration gates run\n  Then all pass: 6 tool-count failures fixed, SIM102 and too-many-locals fixed, lint.baseline stays []",
        "Scenario: Lint never mutates\n  Given a clean worktree\n  When `uv run lint` runs without --fix\n  Then git status shows no tracked modifications and ruff format runs with --check --config config/ruff.toml",
        "Scenario: Registry contract single-sourced\n  Given the TOOLS table\n  When tests and docs read the tool count\n  Then every assertion reads 14 from one helper and formatter-only exemption is explicit"
      ],
      "title": "Green baseline and 14-tool runner contract"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py (sole site): copy_sample_project, git_init_and_stage (test/test@test + add .), git_init_bare (Test/test@example.com, -q, no add), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, idempotent, no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Consumers import mapped subsets only.",
        "tests/_golden.py: collect_findings(project,*,config)->list[Finding] via private pipeline subset + _RECORD_PARSERS, normalize, sort by finding_key, assert len!=0 and zero __CRASH__; assert_matches_golden Counter-multiset diff with UPDATE guard (pytest.fail under CI/GITHUB_ACTIONS); read_oracle_rules, slice_tool_section (used by overlay test), assert_oracle_coverage, assert_tool_coverage."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given tests/_project_helpers.py\n  When tests/ is searched\n  Then each helper is defined exactly once there, duplicates in conftest.py and _autofix_helpers.py are deleted, and each consumer imports only its mapped subset",
        "Scenario: Integration gate within limits\n  Given extracted helpers plus moved scaffolding (>=127 removed, target <=490)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with no suppression, names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Golden hardening holds\n  Given the committed golden\n  When integration runs plus synthetic drift injection\n  Then findings are sorted with len!=0 and zero __CRASH__, drift names exact added/removed keys, oracle and per-tool coverage hold, and regen twice is byte-identical"
      ],
      "title": "Test infra consolidation and golden hardening"
    },
    {
      "directionalInterfaces": [
        "DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; labelled corpus = threshold patterns + brush-off/meaningful tables + real repo suppressions; eval report {model, threshold, precision, recall, p50/p95 latency, RSS, recommendation}.",
        "Tracked cache JSON array sorted by (rule,justification,model), indent=2 sort_keys=True; entry {version, model id/revision, prompt hash, full digest key, decision, files sorted POSIX, last-seen}; refresh via explicit command/flag only; CI guard refuses rewrite; isolation via PYTHON_SETUP_LINT_DECISIONS_PATH.",
        "Pylint semantics contract: jobs/process count, open()/close() timing, partial/staged-run behavior across pylint/pylint-pyi/pylint-tests; verdict selects lock/merge/sweep vs jobs=1 vs sidecars."
      ],
      "id": "M3",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Model choice is evidence-based\n  Given the labelled corpus on CPU\n  When the poc scores decider-nano (+GLiDE if obtainable) at 0.5/0.6/0.7\n  Then the report names precision/recall/latency per threshold and recommends the smallest compliant model+prompt+threshold or a no-go",
        "Scenario: Cache design is deterministic\n  Given the proposed schema on a temp copy\n  When W9704 runs with model absent, present, and cache-hit\n  Then verdicts are identical, prune policy drops stale/deleted entries, and normal lint performs zero writes",
        "Scenario: Cache concurrency is pinned\n  Given pylint 4.x invocation tests\n  When jobs/hook/partial-run semantics are pinned\n  Then the cache lock/merge/sweep design is confirmed or constrained to jobs=1/sidecars by test"
      ],
      "title": "Decision-model and git-cache design spikes"
    },
    {
      "directionalInterfaces": [
        "Row schemas: coding-rules {module, section, evidence file:line, category, est. LoC delta, owner, fix}; test-debloat {module, behaviors, duplicate-of, recommendation, surviving coverage, reason, owner}. Artifact = structured item-report tables (orchestration records; no committed file); coding audit owns the unified map; test audit aligns via inter-dep; iteration-3 replan re-globs HEAD before spawning epics.",
        "Exclusions (marked skipped): src side _semantic.py+.pyi, new backend/cache modules, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests side test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, epic-created conftest/runtime modules."
      ],
      "id": "M4",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts module is listed with violations plus the unified ownership map; semantic symbols are marked skipped",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, and each material limb names pinning tests or blocking debt",
        "Scenario: Ownership map is complete and disjoint\n  Given both audit reports\n  When the unified map is checked\n  Then every src/scripts/tests file appears exactly once with exactly one owner and no file has two owners"
      ],
      "title": "Debloat inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) meets license + CPU + py3.14 + accuracy is unknown. GLiDE-0.4B: Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17. Apache alternatives (decider-nano 149M, bekko-17m, ettin-150m) vary in accuracy/license/CPU proof. No CPU benchmark exists in this environment.",
      "id": "U1",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder): license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision",
        "model-eval-poc (poc, CPU-only): precision/recall at 0.5/0.6/0.7 + latency/RSS on labelled corpus; smallest compliant model/prompt/threshold or no-go",
        "decision-runtime pinning (test-assumptions, inside eval report + pylint-cache-assumptions follow-up if chosen runtime needs API pinning)"
      ]
    },
    {
      "description": "Git-stored cache location/schema/key/cleanup/update semantics and pylint concurrency behavior are unknown. Open: full digest vs truncated, model-rev/prompt-hash in key, code_context inclusion, prune policy, refresh command, CI guard, jobs/open/close/partial-run coordination.",
      "id": "U2",
      "spikeOutlines": [
        "cache-design-spike (poc on temp copies): schema + prune + refresh/CI/isolation + determinism proof (absent/present/hit) with zero normal-lint writes",
        "pylint-cache-assumptions (test-assumptions): pin jobs/process/open/close/partial-run semantics; verdict selects lock/merge/sweep vs jobs=1 vs sidecars"
      ]
    },
    {
      "description": "Size/shape of coding-rules debt (~8.9k src LOC) and redundant/lint-testing tests (~18.4k test LOC, 772 tests) is unmeasured; subsystem epics cannot be scoped without the unified ownership map.",
      "id": "U3",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder, single owner of unified map)",
        "test-debloat-audit (fact-finder, aligned via inter-dep)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Retain 14 tools. Map 'ruff format' to config/ruff.toml in runner/_config.py, return --config in cmd_build._config_flag_for, append --check in _build_command for the normal pass; keep mutating format only in phase 1a under --fix. Single-source the registry invariant (EXPECTED_TOOLS + FORMATTER_ONLY={'ruff format'} exempt from statistics-parser coverage) and update the 6 failing tests + AGENTS.md counts + cli.py:314 help to 14. Verify: format/lint/test/integration gates; `git status` clean after `uv run lint` (no --fix); golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 50,
      "slug": "runner-format-contract",
      "title": "Ruff format check-only contract and 14-tool fix"
    },
    {
      "deps": [],
      "description": "Fix the two masked violations with behavior-preserving refactors only: coverage.py:196-198 SIM102 nested-if -> single `if a and b`; cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select helpers (no pipeline semantics change). Keep lint.baseline []. Verify: lint gate green for these rules; integration + `pytest -q` show no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 30,
      "slug": "baseline-violations-fix",
      "title": "Fix SIM102 and too-many-locals"
    },
    {
      "deps": [
        "runner-format-contract",
        "baseline-violations-fix"
      ],
      "description": "Retry per consult guidance. Create tests/_project_helpers.py with the 10 helpers (copy, git_init_and_stage with test/test@test + add ., git_init_bare with Test/test@example.com -q no add, stage/commit, shipped_config_paths, make_runner_config preserving rumdl side-effect contract, overlay/precommit/install scaffolds). Delete duplicates in conftest.py and tests/runner/_autofix_helpers.py; per-consumer imports only; meet line budget (>=127 removed, <=500, no suppression). FORBIDDEN: lint.baseline, AGENTS.md, docs/**, src/** (tests/** only). Red-test-exempt tests-only refactor. Verify: diff stat tests/** only; golden diff empty; integration + test_golden pass; touched files format-clean.",
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
      "description": "Harden merged tests/_golden.py without changing the committed golden: sort by finding_key in collect, assert len!=0 and zero __CRASH__ records, keep Counter-multiset diff + UPDATE guard + oracle/tool coverage, use slice_tool_section in the overlay test, extend tests/test_golden.py synthetic coverage. Tests-only; no regen unless a reviewed diff proves drift (CI guard enforced). Verify: integration + test_golden pass; golden+counts byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "golden-contract-hardening",
      "title": "Harden golden helpers and assertions"
    },
    {
      "deps": [],
      "description": "No repo edits; report only. Matrix for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m (+MiniLM baseline): license, params/weights size, runtime stack, py3.14 CPU wheels (linux/mac/win), custom-code/vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino license for human review.",
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
      "description": "No committed code; report only (temp venv/copy permitted, network only inside spike). Assemble labelled corpus from test_semantic_threshold.py + test_semantic_check.py patterns + real repo suppressions. Score decider-nano on CPU (+GLiDE-0.4B if obtainable) at 0.5/0.6/0.7: precision/recall, CPU latency/RSS. Recommend smallest model+prompt+threshold meeting the bar, veto-vs-replace mode, or no-go with evidence.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "model-eval-poc",
      "title": "CPU accuracy/latency evaluation"
    },
    {
      "deps": [
        "model-candidate-matrix"
      ],
      "description": "Prototype on temp copies only; no committed files. Design tracked JSON schema (version, model id/revision, prompt hash, full digest key, boolean, last-seen), prune policy, refresh command/flag, CI guard, PYTHON_SETUP_LINT_DECISIONS_PATH isolation. Prove deterministic W9704 with model absent/present/cache-hit and lockfile + merge + atomic replace. Record read-only-lint decision.",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "cache-design-spike",
      "title": "Tracked cache schema and determinism prototype"
    },
    {
      "deps": [],
      "description": "Pin pylint 4.x invocation semantics the cache design relies on: jobs/process count, checker open()/close() timing, partial-path and staged-file runs, 3 pylint invocations sharing one project. Add tests/assumptions/test_pylint_cache_semantics.py (no_external_api, test_<api>_given_<condition>_then_<expected>). No src changes. Record verdict: lock/merge/sweep viable vs jobs=1 constraint vs sidecars.",
      "kind": "test-assumptions",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-cache-assumptions",
      "title": "Pin pylint invocation semantics"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening"
      ],
      "description": "Read-only; zero repo writes. Audit src/** and scripts/** vs CodingRules/AGENTS with symbol-level semantic exclusions (_semantic.py+.pyi, new backend/cache modules, _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS). Output rows {module, section, evidence, category, LoC delta, owner, fix} + UNIFIED disjoint-ownership map (single owner). Reads final HEAD + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations and ownership"
    },
    {
      "deps": [
        "consolidate-integration-helpers",
        "golden-contract-hardening",
        "coding-rules-audit"
      ],
      "description": "Read-only; zero repo writes. Audit tests/** with semantic exclusions (semantic check/threshold modules, TestSuppressionRerankerPipeline, epic-created conftest/runtime modules). Output rows {module, behaviors, duplicate-of, keep|merge|rewrite|remove, surviving coverage, reason, owner} + LoC/runtime estimates + per-limb pinning inventory. Owner column aligned to the unified map via inter-dep.",
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant tests and pinning limbs"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Reranker accept/reject is not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material.",
      "disposition": "confirm with human",
      "why": "Makes 'preserve every material behavior' mechanically testable while allowing the model swap."
    },
    {
      "assumption": "Git-stored decision cache lives in the linted repo (e.g. .python-setup-decisions.json next to lint.baseline); weights stay in the user model cache, never in git.",
      "disposition": "confirm with human",
      "why": "Decisions must reproduce in CI without the model; weights are 0.03-0.8GB with their own licenses."
    },
    {
      "assumption": "Dev/CI do not install the `semantic` extra; gates run heuristic + cache hits. Real-model tests are slow + with_real_api and never in the default suite.",
      "why": "Matches current venv (no torch/transformers) and keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration behavior contracts are retained, not removed.",
      "disposition": "confirm with human",
      "why": "Removes gate-duplicating tests without deleting the fit-for-purpose behavior contract."
    },
    {
      "assumption": "GLiDE-0.4B Fastino Community License is not accepted until human review; spikes prefer Apache-2.0 candidates and exclude CC-BY-NC. If no candidate meets license + CPU + py3.14 + accuracy bar, the epic escalates instead of shipping non-compliant.",
      "disposition": "confirm with human",
      "why": "MIT package cannot absorb unclear/non-commercial model licensing by default."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py`, split format/lint gates are gate contracts; paths/commands do not change. Never run bare `uv run lint` or --overwrite-baseline; captures run on temp copies only.",
      "why": "Bare lint mutates the worktree via ruff format; split gates are the check-only workaround until M1 merges."
    },
    {
      "assumption": "Only semantic-decision-model spawns now (implementation in iteration 3 after spikes); runner/checkers/setup epics spawn at the iteration-3 replan from M4 audits.",
      "why": "Debloat and model work must follow the green baseline, consolidated infra, and evidence-based ownership."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind suppression-justification with a CPU-friendly small decision model plus a git-stored self-cleaning decision cache. Preserve every material behavior. Child epic of `modernize`. Consumes iteration-2 spikes (candidate matrix, CPU eval, cache design, pylint semantics); implements in iteration 3.\n\n## Scope (symbol-level)\nOwned: checkers/_semantic.py+.pyi and new private backend/cache modules (+.pyi each, @beartype, structlog kwargs, tach-clean); check_if_meaningful in checkers/_base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore entries + hatch inclusion for tracked cache; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section only, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache modules, tests/checkers/conftest.py, runtime-assumption modules under tests/assumptions/.\nProtocol: NEVER write tests/data/** (read golden for verification only); if heuristic outcomes shift, emit shift report + CHANGELOG behavior description and root regenerates golden. AGENTS.md pipeline section only on HEAD containing M2 merge, never count lines. tests/assumptions append-only. Out of scope: other checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any runner touch minimal + ADR.\n\n## Requirements\n1. Implement the spike verdict: chosen model id/revision, prompt (noul question + criteria), threshold meeting >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall, or escalate on no-go. No unpinned trust_remote_code; exclude non-commercial licenses.\n2. Contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool and PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION constants. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra or on failure: heuristic + cache hits, one warning, sentinel. Weights in user cache, never git. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' with no bare hex>=20, decision, files sorted POSIX relpaths}. Key (justification,rule,model). Normal lint read-only; explicit refresh command/flag writes via lockfile + merge + atomic temp+move. Sweep scoped to linted files; drop empty-files + stale-model entries. Isolation via PYTHON_SETUP_LINT_DECISIONS_PATH. Must pass all tools incl. detect-secrets.\n5. Real suppressed codes: extract all codes from disable/noqa/ignore, normalize/sort/join ','' as rule (bare-except keeps single symbol). Rule-echo rejects on any element match. On heuristic shift: shift report + CHANGELOG description, root regenerates golden.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; FakeBackend via kwarg + env var; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` assertions and ImportError-propagation test; modules <=500 lines, no suppressions; never test linting.\n7. Docs: update Scope list + CHANGELOG (user-visible only).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification).\n- Cache without model: cached false decision => W9704 emitted, no model load.\n- Brush-off never reaches model; one call per unique (justification,rule); scoped cleanup; no retry storm.\n- Gates: format, lint, `pytest -q`, integration all green with empty lint.baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "`ruff format` ToolSpec mutates the worktree (plain `ruff format`, no --check/--config, default line-length 88 vs shipped 130); every `uv run lint` dirties ~109 files.",
      "id": "TD2-B1",
      "resolution": "Resolved by runner-format-contract: shipped-config --check in normal pass, mutating format only in phase 1a under --fix."
    },
    {
      "category": "blocking",
      "description": "Red baseline: 6 tests assert 13 tools vs 14-entry TOOLS; SIM102 at stub/coverage.py:196; too-many-locals 23/20 at runner/cli.py:50. Empty lint.baseline masks real violations.",
      "id": "TD2-B2",
      "resolution": "Resolved by runner-format-contract (14-tool update) + baseline-violations-fix (SIM102 + split pipeline); lint.baseline stays []."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 661 lines with too-many-lines suppression; helpers duplicated across integration/conftest/_autofix_helpers.",
      "id": "TD2-I1",
      "resolution": "Resolved by consolidate-integration-helpers retry (tests-only, golden byte-identical, <=500, no suppression)."
    },
    {
      "category": "impacting",
      "description": "Golden interface drift: collect signature/behavior vs plan, missing sort/len/crash asserts, unused slice_tool_section.",
      "id": "TD2-I2",
      "resolution": "Resolved by golden-contract-hardening (ratify + harden, no blind regen)."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore, carry vacuous `is None or ...` asserts; heuristic tables duplicated across two modules.",
      "id": "TD2-I3",
      "resolution": "Resolved by semantic epic implementation in iteration 3 (FakeBackend injection, merged table, modules <=500)."
    },
    {
      "category": "impacting",
      "description": "W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic and future model never see the actually-suppressed codes.",
      "id": "TD2-I4",
      "resolution": "Resolved by semantic epic req5 (joined suppressed codes, echo on any element, shift report + root regen)."
    },
    {
      "category": "adjacent",
      "description": "Over-limit/duplicated test infrastructure: _factories.py 1393 lines, _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff + 3 runner files overlapping, test_golden.py 341 lines of helper-unit tests.",
      "id": "TD2-A1",
      "resolution": "Inventoried by test-debloat-audit; iteration-3 checkers/runner epics merge/split per CodingRules."
    },
    {
      "category": "adjacent",
      "description": "Legacy/compat and docs drift: _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py 500+ char rationale with self-suppression, rumdl tests/data-exclude hack, ADR design/ vs docs/adr split, factory-journal detect-secrets noise.",
      "id": "TD2-A2",
      "resolution": "Inventoried by audits; iteration-3 epics remove/fix; factory-journal exclusion is operator/engine action if still flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "`uv run lint` becomes check-only and hermetic; declared split gates can reunify once merged. Tool-count docs/tests stabilize on 14. Phase 1a keeps mutating format under --fix only.",
      "context": "`ruff format` ToolSpec runs plain `ruff format` without --check/--config, rewriting ~109 files with default line-length 88 instead of shipped 130, while TOOLS has 14 entries and 6 tests + docs assert 13.",
      "decision": "Retain 14 tools. Map 'ruff format' to config/ruff.toml, pass --config, append --check in the normal pass; mutate only in phase 1a under --fix. Single-source the 14-name registry invariant; formatter-only tools are explicitly exempt from statistics-parser coverage.",
      "id": "ADR-005",
      "title": "Ruff format check-only contract with shipped config"
    },
    {
      "consequences": "Golden stays byte-identical; drift detection gains explicit crash/empty sensitivity. Overlay test uses the shared slicer. No blind regen.",
      "context": "Merged collect_findings uses private pipeline + record parsers (not run_lint baseline capture), sorts only in serialize, never asserts len!=0 or zero __CRASH__, and slice_tool_section is unused.",
      "decision": "Ratify private-pipeline collect as intentional (avoids second full run and formatter pollution). Harden it: sort by finding_key in collect, assert len!=0 and zero __CRASH__, use slice_tool_section in the overlay test.",
      "id": "ADR-006",
      "title": "Golden contract hardening on merged implementation"
    },
    {
      "consequences": "Lint stays hermetic and deterministic with/without the model; cache updates are explicit, reviewable, CI-guarded. Iteration 3 implements the backend against this contract.",
      "context": "Current cache is per-machine, gitignored, unbounded, 64-bit truncated keys, no cleanup. A git-tracked cache that lint writes on every run would make lint non-hermetic.",
      "decision": "Tracked cache is the source of truth; normal lint is read-only (cache-hit + heuristic). Writes happen only via an explicit refresh command/flag. Schema carries version, model id/revision, prompt hash, full digest key, boolean, last-seen; prune policy proven by spike.",
      "id": "ADR-007",
      "title": "Read-only lint with explicit cache refresh"
    },
    {
      "consequences": "Subsystem epics start in iteration 3 scoped from evidence with disjoint ownership; semantic implementation follows spike verdicts. No concurrent edits to shared test infra.",
      "context": "Remaining scope spans runner, checkers, setup/testing plus the semantic swap. Audits must read final post-consolidation HEAD before epic decomposition.",
      "decision": "Iteration 2 delivers green baseline, test-infra completion, model/cache spikes, and read-only audits. Iteration 3 spawns runner/checkers/setup-testing-scripts epics from the unified ownership map plus the semantic implementation epic.",
      "id": "ADR-008",
      "title": "Progressive epic decomposition after audits"
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "Bounds pass (4/8 milestones, 10/50 items, unique slugs, acyclic); 13 blocking contract/scenario/risk gaps require revision",
  "suggestions": [
    {
      "id": "m1-format-check-indistinguishable",
      "disposition": "fix",
      "summary": "Phase-1a mutating format vs normal-pass --check both use _fix=False, contract cannot distinguish",
      "detail": "cli.py:79 phase-1a builds ruff-format with _fix=False; cli.py:109 normal pass also uses lint_fix=False. Generic _build_command appending --check when not fix would poison phase-1a so it never mutates. Also violates dispatch.py strategy pattern that eliminated if-spec.name branches from _build_command. Fix: dedicated _RuffFormatLintTool.build_command with explicit check vs format modes and update phase-1a caller to request mutating mode.",
      "location": {
        "file": "src/python_setup_lint/runner/cli.py",
        "line": 79
      }
    },
    {
      "id": "m1-registry-parsers-conflated",
      "disposition": "fix",
      "summary": "Registry invariant conflates record vs statistics parsers and leaves EXPECTED_TOOLS owner undefined",
      "detail": "_RECORD_PARSERS covers 9 tools, _STATISTICS_PARSERS covers 13 missing only ruff-format. Plan says RECORD subset + FORMATTER_ONLY exempt from statistics without defining record-subset members (tach/stubtest/verifytypes/detect-secrets intentionally lack record parsers) nor owner module/export for EXPECTED_TOOLS/FORMATTER_ONLY or import path avoiding private-import violations. Fix: split invariants per table, name owner, list per-test migration for stats/t3/fakes count tests.",
      "location": {
        "file": "src/python_setup_lint/runner/parsers.py",
        "line": 231
      }
    },
    {
      "id": "m1-docs-scenario-incomplete",
      "disposition": "fix",
      "summary": "Docs scope omits 5+ 13-tool sites and green-gates scenario ignores C0208/detect-secrets",
      "detail": "AGENTS.md has 5 count sites plus README/overlays/tutorials/runner __init__/factory comment/docstrings; plan names only AGENTS.md + cli.py:314. tool_counts.json already has 14 keys with ruff-format:0 so keeps is no-op. Scenario claims all gates pass after 6+2 fixes but C0208 at _factories_extras:383 and factory-journal secrets noise remain unowned. Fix: enumerate every count site, own C0208+secrets, split per-gate asserts with exit codes and falsifiable --check spy + git-status porcelain.",
      "location": {
        "file": "AGENTS.md",
        "line": 9
      }
    },
    {
      "id": "m2-helper-mapping-undefined",
      "disposition": "fix",
      "summary": "10-helper sole-site list mismatches current symbols and leaves mapping/renames unverifiable",
      "detail": "Current _copy_sample/_init_git/_make_config/_shipped vs _git_init/_write_file/_stage/_commit_all+canary/fake vs conftest shipped_config_paths do not map 1:1 to planned names; _write_file, _FIX_TOOL_NAMES assert, _PostFixFakeRunCmd orphaned. Mapped subsets per consumer undefined; names unchanged contradicts renames; rumdl idempotent/no-op and stage vs bare vs commit overlap vague. Fix: consumer x helper matrix with disposition per current symbol and pinned public names/signatures.",
      "location": {
        "file": "tests/integration.py",
        "line": 51
      }
    },
    {
      "id": "m2-line-budget-contradiction",
      "disposition": "fix",
      "summary": "Line math 661-127=534 contradicts <=500 and targets <=490 vs <=500 disagree",
      "detail": "integration.py is 661 lines; >=127 removed yields 534 still >500 so conjuncts unsatisfiable. Milestone says target <=490, scenario says <=500. No suppression ambiguous: too-many-lines at :12 vs too-many-locals at :202 overlay test needs refactor if all bans apply but unmentioned. Fix: correct budget to >=161, pick single threshold, clarify which suppressions must go and how overlay locals shrink.",
      "location": {
        "file": "tests/integration.py",
        "line": 12
      }
    },
    {
      "id": "m2-golden-crash-sentinel-unowned",
      "disposition": "fix",
      "summary": "__CRASH__ sentinel has no producer and sort/len assertions lack location",
      "detail": "No code emits __CRASH__; crashes surface as [CRASH] text, parsers return [] on garbage, _result_findings returns [] for parser-less tools. Zero __CRASH__ demands emitter (normalize? _result_findings? pipeline?) plus Finding encoding. Sort-in-collect breaks tool-order contract (today serialize-only); len!=0 inside collect breaks synthetic empty tests. slice_tool_section start/end for pylint FAILED/PASSED to pylint-pyi unspecified. Fix: define producer, place asserts in callers, pin slicer args.",
      "location": {
        "file": "tests/_golden.py",
        "line": 189
      }
    },
    {
      "id": "m3-cache-schema-prejudged",
      "disposition": "fix",
      "summary": "Cache interface prescribes full digest before spike and contradicts epic no-hex>=20 secrets rule",
      "detail": "U2 lists full vs truncated as open but M3 interface + ADR-007 mandate full digest key. Full SHA-256 hex (64 chars) violates epic no bare hex>=20 detect-secrets rule. M3 entry {version,model,hash,digest,files,last-seen} differs from epic {justification,rule,model-string,files} on key fields and last-seen. Zero-writes lacks assertion mechanism; stale/deleted prune undefined. Fix: let spike choose secrets-clean encoding, unify schema, define prune + write assert.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 155
      }
    },
    {
      "id": "m3-eval-scope-gaps",
      "disposition": "fix",
      "summary": "Eval scores subset of matrix, omits 90/95/85 bars, and demands model be no-op",
      "detail": "Matrix lists GLiDE/decider-nano/bekko/ettin+MiniLM but scenario scores only decider-nano (+GLiDE if obtainable). Compliant undefined in M3; epic 90% acc/95% meaningless-precision/85% meaningful-recall not cited. Corpus (threshold+brush-off tables+real suppressions) lacks size/label rubric/split. Identical verdicts across absent/present/hit would mean model never differs from heuristic. Fix: score all candidates, cite bars, define corpus, correct to hit==model absent==heuristic.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 143
      }
    },
    {
      "id": "m3-pylint-concurrency-illposed",
      "disposition": "fix",
      "summary": "Cache concurrency spike assumes contention that sequential runner without -j never creates",
      "detail": "Runner executes tools sequentially; pylint ToolSpecs pass no -j so 3 invocations are sequential subprocesses not concurrent writers. Spike asks jobs/process/open/close/partial-run without naming writer (checker open/close vs runner post-process) or write timing. If runner-side post-merge no lock needed. Fix: reframe to identify writer+timing first then derive lock/merge/sweep vs jobs=1 vs sidecars with --path scoping.",
      "location": {
        "file": "src/python_setup_lint/runner/dispatch.py",
        "line": 104
      }
    },
    {
      "id": "m4-ownership-map-undurable",
      "disposition": "fix",
      "summary": "Unified map as ephemeral tables cannot feed iteration-3 replan that re-globs HEAD",
      "detail": "Artifact is item-report tables with no committed file but replan re-globs HEAD before spawning epics: nothing to glob. Per-file exactly-once cannot express per-symbol skips (_base.py::check_if_meaningful) or future files (new backend/cache, epic-created conftest) that do not exist. Owner enum, file universe (src/scripts/tests vs config/docs/data/.pyi/conftest/__init__), handling of stubs/data undefined. Fix: commit durable map or define replan input contract, separate file ownership from symbol exclusions.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 142
      }
    },
    {
      "id": "plan-replan-coordination",
      "disposition": "fix",
      "summary": "Parallel M3/M4 replanAfter with cross-milestone deps risks premature or deadlocked replan",
      "detail": "M3 and M4 both replanAfter with no ordering; M4 depends on M2 not M3 so M3 could replan while M4 running. Item-level replanAfter on both audits with coding->test dep risks first triggering replan before second runs. Spawn timing contradictory: semantic spawns now vs iteration-3 spawns all. Fix: single replanAfter on M4 or M4 depends on M3, drop item-level replans, pin spawn wave.",
      "location": {
        "file": "tests/integration.py",
        "line": 116
      }
    },
    {
      "id": "u1-runtime-pinning-orphaned",
      "disposition": "fix",
      "summary": "decision-runtime pinning spikeOutline has no itemOutline owner or deps",
      "detail": "U1 lists 3 spikeOutlines but M3 has only matrix + eval-poc items; runtime pinning folded as inside eval report + follow-up without dedicated item, acceptance, file path, or schedule. If chosen runtime needs torch/transformers py3.14 wheel or custom-code pinning, work unowned. Fix: add explicit test-assumptions item or remove outline and fold criteria into eval-poc report.",
      "location": {
        "file": "pyproject.toml",
        "line": 29
      }
    },
    {
      "id": "debt-adr-gaps",
      "disposition": "fix",
      "summary": "Blocking debt omits C0208/secrets and ADRs overclaim hermetic/check-only with factual errors",
      "detail": "TD2-B2 claims green after 6+2 fixes but omits C0208 set-iteration and factory-journal secrets (punted to operator). ADR-005 check-only/hermetic false under --fix and with caches/subprocesses. ADR-006 avoids second run false: collect IS second pipeline run; invents __CRASH__. ADR-007 prejudges full digest and claims deterministic with/without model false. Fix: inventory all red violations, correct to check-only-without---fix and deterministic-given-cache+model.",
      "location": {
        "file": "tests/runner/_factories_extras.py",
        "line": 377
      }
    },
    {
      "id": "material-behavior-definition",
      "disposition": "human-awareness",
      "summary": "Reranker non-material carve-out redefines preservation guarantee needs operator visibility",
      "detail": "Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 1
      }
    },
    {
      "id": "cache-location-choice",
      "disposition": "human-awareness",
      "summary": "Git-tracked decisions file at linted root is high-impact needs operator visibility",
      "detail": "Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 38
      }
    },
    {
      "id": "fastino-license-gating",
      "disposition": "human-awareness",
      "summary": "GLiDE Fastino license requires human review before any non-Apache model ships",
      "detail": "Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.",
      "location": {
        "file": "pyproject.toml",
        "line": 29
      }
    },
    {
      "id": "deps-over-serialized",
      "disposition": "optional",
      "summary": "M2 after M1 over-serializes tests-only refactor sharing no files with prod fixes",
      "detail": "consolidate helper is tests-only forbidden src/docs/baseline while M1 touches src + 6 count tests + docs; sets disjoint (integration/conftest/autofix vs lint-runner/stats/t3/fakes). Forcing order wastes maxParallelItems 4. Keep consolidate->golden (both touch overlay) and audits->M2. Non-blocking polish.",
      "location": {
        "file": "tests/integration.py",
        "line": 51
      }
    },
    {
      "id": "sizing-hints-zero-stories",
      "disposition": "optional",
      "summary": "Zero prod hints on report/tests-only items are intentional no sizing breach",
      "detail": "M1 stories 50/30 within storyMax 300; 8 others carry 0 as tests-only red-test-exempt or report-only fact-finder/poc/test-assumptions. No hint above kind reference, none missing. Advisory only: 0-hint stories are deliberate not missing estimates.",
      "location": {
        "file": "src/python_setup_lint/runner/cmd_build.py",
        "line": 107
      }
    }
  ]
}

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
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.

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
