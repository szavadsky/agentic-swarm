# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.

---

## 1. Snapshot and Gate State

| Fact | Evidence |
|---|---|
| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |

**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).

---

## 2. Module Map

### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)

| File(s) | Responsibility |
|---|---|
| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |

### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)

| File(s) | Responsibility |
|---|---|
| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |

### 2.3 Setup / testing / packaging

| File(s) | Responsibility |
|---|---|
| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |

### 2.4 Tests (`tests/`)

59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).

---

## 3. Key Interfaces & Signatures

### 3.1 Justification decision entry point — `check_if_meaningful`

`src/python_setup_lint/checkers/_base.py:142-238`:

```python
@beartype
def check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool:
```

Flow:

1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).

`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.

Call sites (all five pass a real rule/context):

- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).

### 3.2 Semantic implementation — `semantic_check_if_meaningful`

`src/python_setup_lint/checkers/_semantic.py:125-189`:

```python
@beartype
def semantic_check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool | None:
```

| Detail | Evidence |
|---|---|
| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |

### 3.3 Cache and model constants (current, to be replaced)

`_semantic.py:37-52`:

```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get(
    "PYTHON_SETUP_LINT_RERANKER_MODEL",
    "jina-reranker-v2-base-multilingual",
)
```

Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.

### 3.4 Planned backend contract from ADR-010 (absent at HEAD)

`docs/adr/ADR-010.md:23-36` fixes:

- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
- Prune missing files and stale model identifiers.
- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.

No implementation module exists at HEAD; `_semantic.py` remains the only decision path.

### 3.5 Runner interfaces relevant to a cache-refresh command

- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.

### 3.6 Checker helper / test harness interfaces

- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).

---

## 4. Relevant Excerpts and Implementation Logic

### 4.1 Current semantic pipeline is reranker-first, not heuristic-first

`_semantic.py:1-12`:

```python
# Semantic justification checker using a cross-encoder reranker (Track B).
# ...
# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
#    Re-score the justification against the rule and code context with a
#    dedicated cross-encoder for higher accuracy.
# ...
# On ImportError ... or model download failure, semantic_check_if_meaningful
# returns None, signalling the caller to fall back to the heuristic check.
```

This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.

### 4.2 `semantic_check_if_meaningful` scoring and write path

`_semantic.py:142-189` (condensed):

```python
cache_key = hashlib.sha256(
    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]

reranker = _load_reranker()
if reranker is None:
    return None
...
scores = reranker.predict([(primary, query)])
result = float(scores[0]) >= 0.5
_RESULT_CACHE[cache_key_int] = result
_save_result_cache()
return result
```

Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.

### 4.3 W9704 emission and the two decision call paths

`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
):
    return
self.add_message("unjustified-suppression", ...)
```

`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).

### 4.4 Cache writer verdict that any redesign must consume

`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:

- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.

The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).

### 4.5 ADR-010 conflicts with the current tests

`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.

### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)

`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:

- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).

So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.

### 4.7 Existing sorted-JSON/atomic-write patterns

- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.

---

## 5. Existing Tests and Conventions

### 5.1 Test layers and commands

| Layer | Command | Scope / evidence |
|---|---|---|
| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |

### 5.2 Checker test conventions

- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.

### 5.3 Golden behavior-preservation contract

`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).

Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).

### 5.4 Semantic test inventory and redundancy

| File | Lines / roles | Redundancy / impact |
|---|---|---|
| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |

### 5.5 Existing debloat evidence (objective)

| Category | Evidence |
|---|---|
| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |

### 5.6 Third-party assumptions to read before debloating

- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.

---

## 6. Model Candidate Landscape (external; verify before adoption)

The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.

| Candidate | Params | License | Runtime / CPU evidence | Notes |
|---|---:|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |

Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.

Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).

---

## 7. Open Questions and Uncertainties

1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?

2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.

3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).

4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.

5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.

6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).

7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?

8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?

9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.

10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).

11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.

12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.

13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.

14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.

---

## 8. Recommendations for the Architect

1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.

2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.

3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.

4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.

5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.

6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.

7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
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

## Wave Report
{
  "blockedItems": [],
  "debt": [],
  "failedItems": [],
  "iteration": 4,
  "mergedItems": [
    "runner-dispatch-split",
    "runner-factories-trim",
    "stale-disables-portability-cleanup"
  ],
  "recommendations": [
    "Consider retiring the split format/lint infra gates now that `ruff format` is check-only on normal passes (src/python_setup_lint/runner/dispatch.py:312-336) with mutation isolated to the fix-phase format pass (src/python_setup_lint/runner/cli.py:72-78); verify `uv run lint` is mutation-free, then consolidate gates and update the infra operator note."
  ],
  "status": "complete",
  "summary": "Wave 3 (iteration 4) complete: merged runner-dispatch-split, runner-factories-trim, stale-disables-portability-cleanup. Tree hygiene clean: no untracked files, git diff --check clean, no conflict markers or stray tmp/bak/orig/rej artifacts in src/tests/config/docs. Gate Diff (baseline vs now) shows zero regressions and all gates now pass: format pass->pass green, test-integration pass->pass green, lint fail->pass IMPROVED, test fail->pass IMPROVED.",
  "wave": 3
}

## Tech Debt
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
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


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
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


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
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
      path/class/function names; golden+counts byte-identical; MUST NOT touch
      AGENTS.md, docs/**, or src/** (test-only enforcement) — AGENTS.md counts +
      cli.py help sync moved to docs-counts-sync follow-up, leave stale by
      design. Acceptance: integration, `pytest -q` pass; golden+counts
      byte-identical; no new lint violations in touched files (pre-existing
      SIM102/R0914/C0208 persist)."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Follow-up to consolidate (test-only, cannot touch docs/prod).
      Update AGENTS.md test/tool counts from stale base (1290 pass / 13 tools)
      to runtime actuals (verify: `uv run pytest --collect-only -q` count incl.
      new assumption/golden tests + len(TOOLS)==14), count lines only (epic owns
      AGENTS.md pipeline section, never touch); and
      src/python_setup_lint/runner/cli.py:314 help text ('all 13 tools' → 'all
      14 tools'). Prod scope strictly bounded to that one help string (no
      behavior change). No test changes; golden+counts byte-identical.
      Acceptance: counts match runtime; `uv run pytest tests/integration.py -v`
      passes; no new lint violations in touched lines."
    kind: dev
    milestoneId: M2
    slug: docs-counts-sync
    title: Sync AGENTS.md counts and cli help to 14-tool world
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


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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


--- Prior Plan plan-2.1.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
  - deps:
      - baseline-violations-fix
    description: "Close the M1 green-baseline tail: wave-2 report lists lint still
      red, and the two W9704 sites from infra notes
      (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
      options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore
      site) were never owned by any item (TD2-B2 omitted them). Steps: (1)
      Reproduce current failures via the declared gates (format check + 13-tool
      lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**;
      capture exact remaining violations. (2) Fix with
      justification-comment-only edits (no behavior change; red-test-exempt like
      baseline-violations-fix): strengthen trailing justifications so the
      justification checker accepts. If additional violations appear, fix only
      if trivially behavior-preserving, else record as debt in the report — do
      not balloon scope. FORBIDDEN: lint.baseline edits (stays []),
      tests/data/** changes, golden regen, unrelated refactors,
      .secrets.baseline, factory records. Secrets-triage verdict is human-async
      and out of scope. Verify: lint gate zero violations in src/** and
      tests/**; `pytest -q` + integration show no new failures; golden
      byte-identical; touched files format-clean."
    kind: story
    milestoneId: M1
    prodBudgetHint: 5
    slug: remaining-lint-violations-fix
    title: Fix remaining src/tests lint violations (W9704 tail)
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-3.yaml ---
iteration: 3
milestones:
  - directionalInterfaces:
      - "Validated unified map: owner enum
        {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15
        (±5 drift budget per owner, total equal to the git-ls-files recount);
        epic assignment maps setup-testing files to epic-runner-modernize;
        ownership universe = src/** + scripts/** + tests/** EXCLUDING
        tests/data/**; root-owned group (tests/data, config, docs, repo-root
        files, epics read-only except enumerated packaging exception);
        symbol-exclusion column (incl. _base.py:238 rule-echo line and
        no_try_import register line as semantic-owned); planned-path
        reservations (incl. tests/checkers/conftest.py as reservation); drift
        list in {path, auditRef, headEvidence, disposition:
        confirmed|corrected|disputed}. Artifact = item-report tables with
        revision map-<HEAD short SHA> (durable orchestration records)."
      - .secrets.baseline filters_used gains the ^\.factory/ should_exclude_file
        entry in the version-correct form (schema pre-validated against
        installed detect-secrets); journals stay committed; M1 acceptance cites
        mechanism + pinned HEAD, not finding counts.
      - Pylint writer-first verdict (writer + timing + --path scoping) readable
        from tests/assumptions/test_pylint_cache_semantics.py report;
        cache-design-spike input satisfied.
      - "AGENTS.md split by exact rows with engine wave order: runner-owned (if
        assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope
        table (add ruff format row); semantic-owned = ### Semantic justification
        pipeline subsection only; checkers never touches AGENTS.md; the engine
        schedules the runner AGENTS.md item in an earlier wave than the semantic
        pipeline item (order recorded at kickoff with post-kickoff HEAD);
        semantic verifies read-only via git merge-base that its base contains
        the runner merge when runner was assigned, else waits. Agents perform
        zero git writes."
      - "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the
        drift list; defaults = runner owns counts/scope/version/pin rows,
        semantic owns pipeline subsection, root owns ADR reconciliation via
        adr-formalization. Shared-file single-writer table: checkers/_base.py =
        semantic only; _source_stream.py = checkers (new file); no_try_import
        register line + patterns = semantic; test_suppression class block =
        semantic, rest = checkers; trivial_wrapper peek line preconditioned on
        runner close-up."
    id: M1
    scenarios:
      - >-
        Scenario: Ownership map validated
          Given iteration-2 audit reports plus HEAD
          When ownership-map-revalidation re-globs via git ls-files and recounts
          Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>
      - >-
        Scenario: Secrets gate green by mechanism
          Given the schema pre-validation plus the .factory/ exclusion merged
          When detect-secrets scans git ls-files on a clean checkout
          Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only
      - >-
        Scenario: Epic kickoff gated on validated artifacts
          Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion
          When epic-kickoff-gate completes
          Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)
    title: Validated decomposition and green-gate preconditions
  - directionalInterfaces:
      - "Epic runner (owns runner/** + setup-testing files): dispatch.py split
        into modules each ≤500 lines with zero too-many-lines/complexity
        suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced
        re-exports); baseline.py compat shims deleted (or kept with in-repo
        consumer evidence + debt note); tests/runner/_factories_extras.py split
        with duplicate disables collapsed; each test removal/merge names its
        survivor; shift report or no-shift declaration emitted in the epic
        close-up."
      - "Epic checkers: shared stream helper in NEW checkers-owned
        _source_stream.py replacing the drift-list-pinned block list
        (grep-verified zero remaining copies), ZERO _base.py diff from this
        epic; register() keeps only the ADR-012 missing-beartype justification
        with no @beartype added (no_try_import register line skipped —
        semantic-owned); type-ignore[misc] removal attempted via shared typed
        base with retain-and-report fallback; _legacy_scan renamed with all call
        sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek
        line preconditioned on runner close-up; tests/checkers/_factories.py
        split by checker group with ParameterSet typing; W9704/W9738 callers
        emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic
        tests; 40 W9704 + 11 W9738 heuristic outcomes pinned."
      - "Epic semantic (sole _base.py writer): DecisionBackend Protocol
        decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with
        FakeBackend kwarg/env injection tests; dotted-path honored only under
        PYTEST_CURRENT_TEST with loader test pinning both behaviors;
        .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no
        bare hex>=20, secrets-clean); read-only lint proven by hash-asserted
        zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra
        without sentence-transformers with loader-returns-None + one-warning
        proof (no hatch entry, .gitignore untouched); rule-echo on-any-element
        change at _base.py:238 with joined cache keys; merged deduped heuristic
        table; docs state backend + cache + no-go."
    id: M2
    replanAfter: true
    scenarios:
      - >-
        Scenario: Runner modernized without behavior drift
          Given the runner + setup-testing scope from the validated map
          When its items merge
          Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record
      - >-
        Scenario: Checkers modernized without behavior drift
          Given the checkers epic scope with semantic exclusions
          When its items merge
          Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported
      - >-
        Scenario: Semantic infrastructure ready for a future model
          Given the ADR-009 no-go verdict
          When the semantic epic merges
          Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported
    title: Subsystem modernization via three epics
  - directionalInterfaces:
      - "Shift-report handoff contract: each epic emits a shift-report section
        or explicit no-shift declaration in its close-up report with
        {justification-class description, added/removed finding keys, CHANGELOG
        snippet, evidence file:line}; M2 replanAfter:true is the enforceable
        gate (the engine schedules no M3 item until the replan after M2 epic
        close-ups); epic-shift-report-collection is the first post-replan item
        and stays pending unless all three close-ups exist (fails open, never
        fabricates); golden-regen-hatch consumes only the handoff record; review
        record = regen-hatch report with key-by-key diff (or no-op
        attestation)."
      - "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only
        (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run;
        key-by-key diff review against the handoff shift report; golden + tool
        counts committed together; no blind regen ever."
      - "Final gate table: format exit code; lint per-tool results on scoped
        checkout; pytest counts (pass/skip/deselect); integration
        9-collected-0-failed with pre-commit env pinned (9 passed with it, 7
        passed + 2 skipped without); golden hash equality or regen diff;
        lint.baseline []; docs reconciliation checklist with must-contain
        strings (semantic-justification.md: DecisionBackend,
        .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md:
        DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER
        deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] +
        no-go; AGENTS.md counts reconciled to the 9-collected contract +
        ruff-format scope row; CHANGELOG version; README pin; ADR staleness
        notes per kickoff assignment). Red-cell routing: red cells route back
        via new root items (root-owned files) or epic follow-up items
        (epic-owned files), never baseline edits."
    id: M3
    scenarios:
      - >-
        Scenario: Golden integrity preserved
          Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)
          When golden-regen-hatch runs
          Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs
      - >-
        Scenario: Iteration closes with evidence
          Given all epic merges via the handoff record
          When final-gate-validation completes
          Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit
    title: Behavior-preservation close-out and gate evidence
uncertainties:
  - description: Audit evidence may have drifted since iteration 2 (file:line moves,
      renames, merged items). Epic scopes built on stale rows would misfire.
    id: U1
    spikeOutlines:
      - "ownership-map-revalidation (fact-finder, zero writes): re-glob HEAD,
        confirm 5-owner counts + exclusions + reservations, emit drift list"
  - description: Whether any compliant decision model exists is unknown
      (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino
      review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral —
      no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample,
      license decision, CPU benchmark).
    id: U2
  - description: Cache concurrency semantics (writer identity/timing, --path
      scoping) depend on the pylint verdict file, which may still be unmerged.
    id: U3
    spikeOutlines:
      - "pylint-cache-semantics-closure (test-assumptions): land or verify the
        single verdict file; epic consumes it, never invents"
itemOutlines:
  - deps: []
    description: "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for
      the ownership universe via git ls-files filtered to src+scripts+tests
      minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner
      with total equal to the recount. Confirm symbol exclusions
      (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo
      line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test
      modules + TestSuppressionRerankerPipeline class block), planned-path
      reservations (incl. tests/checkers/conftest.py as reservation, not an
      owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin
      the exact stream read/decode block list + helper signature for the
      checkers epic. Output: validated map with revision map-<HEAD short SHA> +
      drift list in {path, auditRef, headEvidence, disposition:
      confirmed|corrected|disputed} consumed by all three epics. Zero repo
      writes."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: ownership-map-revalidation
    title: Re-validate unified ownership map at HEAD
  - deps: []
    description: "Land the operator-approved exclusion so the lint gate is green on
      clean checkouts. Pre-validate the filters_used schema against the
      installed detect-secrets version first (should_exclude_file signature;
      list-pattern vs scalar form) and use the version-correct form; then insert
      the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line
      40), keeping journals committed. Verify: full git-ls-files detect-secrets
      scan exits 0 on clean checkout while a planted control secret still exits
      1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk
      caveat (write-time redaction + periodic unfiltered audits). No other
      baseline edits."
    kind: story
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-baseline-exclusion
    title: Add .factory/ exclusion to .secrets.baseline
  - deps: []
    description: "Close the iteration-2 M3 gap if still unmerged at iteration-3
      start: EXACTLY ONE new file
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>, offline, no src writes).
      Writer-first: writer + timing + --path scoping verdict (crash-safe lock vs
      runner post-merge vs jobs=1/sidecars-if--j). If the iteration-2 item
      already merged, this item verifies the verdict exists and is readable;
      otherwise it lands the file. Verdict feeds epic-semantic-infrastructure
      cache concurrency (epic must not invent semantics)."
    kind: test-assumptions
    milestoneId: M1
    prodBudgetHint: 0
    slug: pylint-cache-semantics-closure
    title: Land or verify pylint writer/timing verdict
  - deps:
      - ownership-map-revalidation
      - pylint-cache-semantics-closure
      - secrets-baseline-exclusion
    description: "Root-owned coordination checkpoint (report-only, zero repo
      writes). Confirm the three epics consumed the validated map revision +
      drift list, the pylint verdict is readable, and the .secrets.baseline
      exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave
      order (runner item in an earlier wave than the semantic pipeline item when
      runner is assigned, with the read-only merge-base verification rule), the
      shared-file single-writer table, and docs-row assignments from the drift
      list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG
      version + README pin; semantic owns pipeline subsection; root owns ADR
      reconciliation via adr-formalization). Resolve any ownership dispute by
      amended assignment before epic waves scale. Output: gate report with
      consumed revision ID, per-epic ownership tables, wave order, docs
      assignments, and zero unresolved disputes (each resolved dispute cites its
      amended assignment reference)."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: epic-kickoff-gate
    title: Epic kickoff and ownership-dispute gate
  - deps: []
    description: "Root-owned ADR lifecycle (docs only, root-owned files): overwrite
      the docs/adr/ADR-009/010/011 problem-statement stubs with full
      Context/Decision/Consequences ADRs matching this plan, create
      docs/adr/ADR-012.md for the register() exemption, add staleness notes to
      ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md
      pointer to design/ per CodingRules). Verify: 12 ADR files each carry
      Context/Decision/Consequences or an explicit staleness note; rumdl clean;
      no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs
      assignment)."
    kind: story
    milestoneId: M1
    prodBudgetHint: 0
    slug: adr-formalization
    title: Formalize ADRs 009-012 and reconcile stale ADRs
  - deps:
      - epic-kickoff-gate
    description: "Root-owned fan-in (report-only, zero repo writes). M2
      replanAfter:true is the enforceable gate: the engine schedules this item
      only in a post-replan wave after M2 epic close-ups exist. Read the three
      epic close-up reports; extract each epic's shift-report section (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line};
      consolidate into one handoff record with exactly 3 epic sections. If any
      close-up is missing, the item stays pending (fails open — never
      fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff
      record has exactly 3 epic sections, each either a shift report or an
      explicit no-shift declaration."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: epic-shift-report-collection
    title: Consolidate epic shift reports into handoff record
  - deps:
      - epic-shift-report-collection
    description: "Root-owned regen hatch, executed ONLY on a reviewed shift report
      in the handoff record (heuristic outcome change, e.g. joined-rule
      encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI),
      verify byte-identical double run, review the added/removed diff key-by-key
      against the shift report's justification-class description, commit golden
      + tool counts together. If all three handoff sections declare no-shift,
      this item is a no-op verification (golden byte-identical). NEVER
      blind-regen. Output: regen report with key-by-key diff review (or no-op
      attestation) consumed by final-gate-validation."
    kind: story
    milestoneId: M3
    prodBudgetHint: 0
    slug: golden-regen-hatch
    title: Conditional golden regen on reviewed shift report
  - deps:
      - golden-regen-hatch
    description: "Root-owned final validation (report-only, zero repo writes):
      format gate exit 0; lint gate green on scoped clean checkout for
      detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green
      (count + skips recorded); integration 9-collected-0-failed with pre-commit
      env pinned (9 passed with it installed, 7 passed + 2 skipped without);
      golden byte-identical or regen-with-reviewed-diff per the hatch report;
      lint.baseline []; docs reconciliation verified with must-contain strings
      (semantic-justification.md: DecisionBackend, .python-setup-decisions.json,
      ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md:
      DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend;
      CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the
      9-collected contract + ruff-format scope row; CHANGELOG version; README
      pin; ADR staleness notes per kickoff assignment). Record final gate table
      for close-up. Red-cell routing: red cells route back via new root items
      (root-owned files) or epic follow-up items (epic-owned files) — fixes go
      back to items, never to baseline edits."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: final-gate-validation
    title: Final gate table and docs reconciliation check
assumptions:
  - assumption: Material behavior = golden 158 findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Heuristic rejections are material; model accept/reject was
      never material (dormant path). Tightening remains intentional when a model
      eventually ships.
    disposition: confirm with human
    why: Preserves the iteration-1/2 operator-approved boundary; golden stays the
      mechanical contract.
  - assumption: Iteration-2 spike reports (candidate matrix, CPU eval no-go,
      runtime-pinning skip, pylint writer verdict if merged, coding-rules +
      test-debloat audits) are durable and readable at replan per ADR-008;
      validation re-globs HEAD.
    why: Plan-2 ADR-008 durability decision; verified pattern for both audits.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Any real-model test is slow + with_real_api, never in the
      default suite.
    why: Matches current venv and keeps gates offline, fast, deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration contracts are retained."
    disposition: confirm with human
    why: Operator-approved in iteration 1; removes gate-duplicating tests without
      deleting the fit-for-purpose contract.
  - assumption: detect-secrets MemoryError on huge tracked artifacts is
      environmental (worktree state), not a product violation; validate on
      clean/scoped checkout; never weaken baseline or exclude product paths.
    why: Context-pack measurement; baseline stays [] by design.
  - assumption: "Operator's secrets answers stand: journals stay committed;
      ^\\.factory/ filter lands in .secrets.baseline filters_used (task-branch
      commit); harness filter-seeding is a follow-up outside this task."
    why: Steering directive 1794158471467; M1 acceptance cites mechanism + pinned
      HEAD.
  - assumption: Integration gate contract is 9 collected, 0 failed with pre-commit
      env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped
      via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands
      integration row is reconciled to this contract, not unconditional 9/9 or
      stale 7 pass.
    why: tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional
      9/9 fails on minimal envs while stale 7 pass under-reports.
  - assumption: "Iteration 3 ships semantic infrastructure only (DecisionBackend,
      tracked cache, FakeBackend, docs); the headline model swap is NOT complete
      at close-up and must not be claimed as such. Follow-up triggers:
      double-rated real brush-off sample repairing the 215/0 corpus defect,
      human Fastino license decision if GLiDE is recommended, CPU latency/RSS
      benchmark on the chosen runtime."
    disposition: confirm with human
    why: ADR-009 no-go gating; operator must approve infra-only close-up per review
      human-awareness item.
  - assumption: Epics are first-class plan output for root tasks (same model as
      iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8
      in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12,
      semantic ≤10 items) are enforced when each epic's own plan is reviewed.
    why: The plan schema defines child-epic spawning for root tasks; epic-internal
      items live in child plans with their own review, not in the root item
      list.
epics:
  - intent: >-
      # epic-runner-modernize


      Child epic of `modernize`. Own per validated map: runner/** (src + tests +
      stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py,
      setup/install tests). Out of scope: checkers/**, semantic symbols,
      tests/data/** (read golden for verification only; NEVER write — regen is a
      root item), tests/checkers/**. Advisory budget: ≤12 items.


      ## Requirements

      1. CodingRules enforcement: remove all complexity suppressions by
      refactoring (dispatch.py 542-line disable -> split
      registry/strategies/parser-sets into modules each <=500 with single-source
      re-exports; no threshold raises). Delete dead compat (baseline.py
      peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting
      tests) unless external-consumer evidence is found in-repo (then record and
      keep). Remove redundant wrappers/fallbacks per audit rows. Split
      tests/runner/_factories_extras.py (511 lines; collapse the duplicate
      disables) by group.

      2. Test debloat per test-debloat-audit rows: merge overlapping
      baseline-diff/runner-stats/t3 parser-completeness coverage (exact
      duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting
      groups owned by runner (self-lint, config-consistency, noise-filter,
      private-imports scan, hardcoded-checkout live test) mapping each intent to
      golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename
      milestone-ID test files by behavior (keep class/function contract names
      where gates reference them).

      3. Keep test intent: every removal/merge names its survivor (golden
      scenario, assumption test, or retained unit test); default suite keeps a
      full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected
      survivor named).

      4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands
      rows (:9-11) + ## Tool Scope table (add ruff format row); the engine
      schedules this item in an earlier wave than the semantic pipeline item
      (order in kickoff report); record the merge HEAD for semantic's read-only
      merge-base verification. If unassigned, propose count/scope diffs in the
      close-up report for the root docs follow-up; never touch other sections.

      5. Shift reports: emit a shift-report section in the epic close-up (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line} for the
      root handoff record.

      6. Contracts: golden 158 findings + tool counts byte-identical unless a
      reviewed regen is requested via shift report (root regenerates);
      lint.baseline stays [].


      ## Acceptance

      - runner/** + setup-testing files have zero too-many-lines/complexity
      suppressions; all modules <=500 lines; dispatch registry still
      single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).

      - Compat shims deleted (or kept with in-repo consumer evidence + debt
      note).

      - Removed tests each map to a survivor; blocking-debt limbs from the audit
      either pinned by new tests or explicitly flagged.

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned; golden byte-identical or
      shift-reported.
    slug: epic-runner-modernize
  - intent: >-
      # epic-checkers-modernize


      Child epic of `modernize`. Own per validated map: checkers/** (src + tests
      + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch,
      zero diff from this epic): checkers/_semantic.py+.pyi,
      _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo
      line (this epic makes ZERO _base.py edits — its stream helper lives in new
      checkers-owned _source_stream.py),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's
      register() disable line (semantic standardizes it alongside the patterns),
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class block. Planned-path reservations for
      semantic modules are read-only. Out of scope: runner/**, tests/data/**
      (read-only), other test dirs, AGENTS.md (never touch). Advisory budget:
      ≤12 items.


      ## Requirements

      1. CodingRules enforcement on checkers/**: shared stream read/decode
      helper in NEW _source_stream.py replacing the drift-list-pinned block list
      (audit-estimated ~15; exact list + helper signature pinned at re-glob;
      grep-verified zero remaining copies); register() keeps the ADR-012
      missing-beartype justification (no @beartype added; skip
      no_try_import_checker.py's register line — semantic-owned);
      type-ignore[misc] on mixin classes: attempt removal via a shared typed
      base, fallback retain with standardized justification + reported blocker
      (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path)
      with all call sites updated; trivial_wrapper_checker: remove dead
      _legacy_* exemptions unconditionally, remove the peek_fallback_tools
      exemption ONLY after reading the runner close-up confirming shim deletion
      (if runner kept it, keep the exemption); split or slim over-limit modules
      (never raise thresholds); fix .pyi fidelity/private-symbol rows from the
      audit.

      2. Test debloat per test-debloat-audit rows: split
      tests/checkers/_factories.py (1,393 lines) by checker group with
      ParameterSet typing and cases next to tests; inline the 10 local
      _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers;
      remove unused factory helpers; fix test naming toward
      test_<method>_given_<condition>_then_<expected> for touched files; remove
      never-testing-linting checker tests only if the audit lists them (with
      survivors).

      3. Joined-code extraction at W9704/W9738 call sites (this epic owns the
      caller files): extract all suppressed codes via existing patterns,
      normalize/sort/join ',' as the rule argument (bare-except keeps single
      symbol). The on-any-element matching lives in the semantic-owned body;
      either merge order converges to the same final state (extraction alone is
      echo-neutral under exact match; matching alone is a no-op for single
      codes), so no cross-epic ordering is needed — if outcomes shift, emit a
      shift report. Never edit check_if_meaningful itself.

      4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0
      guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except
      the semantic-owned pipeline class block, which this epic does not touch).

      5. Shift reports: emit a shift-report section in the epic close-up (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line} for the
      root handoff record.

      6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged
      on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled
      corpora; lint.baseline stays [].


      ## Acceptance

      - Zero copied stream blocks outside _source_stream.py; zero _base.py diff;
      register() functions carry only the ADR-012 justification; mixin misc
      suppressions removed or retained-with-justification per the attempt rule;
      no over-limit checker module with a disable.

      - _factories.py split with no behavior change; local helper duplicates
      eliminated; callers emit joined codes.

      - All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or
      with reviewed shift report + root regen).

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned; golden byte-identical or
      shift-reported.
    slug: epic-checkers-modernize
  - intent: >-
      # epic-semantic-infrastructure


      Child epic of `modernize`. Implement the model-INDEPENDENT semantic
      infrastructure now; model wiring waits on the corpus-repair + license
      verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files:
      checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new
      private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype,
      structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in
      checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate +
      backend injection + rule-echo on-any-element matching for joined codes:
      _base.py:238 exact-match becomes any-element match over comma-joined
      sorted codes; backward-compatible no-op for single codes);
      _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in
      no_try_import_checker.py; pyproject [semantic] extra block + uv.lock
      regeneration (enumerated packaging exception, single writer; .gitignore
      untouched — legacy .cache lines stay, decisions file committed; NO hatch
      entry — tracked cache is consumer-runtime data, not wheel payload); docs
      (semantic-justification.md rewrite, custom-checks.md bullet,
      troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG
      user-visible); tests: test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class block, new runtime-assumption
      modules under tests/assumptions/ (append-only; never touch root __init__ +
      3 contract modules + test_pylint_cache_semantics.py).
      tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not
      exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).


      Protocol with root: NEVER write tests/data/** (read golden for
      verification only); on heuristic shift emit shift report + CHANGELOG
      behavior description (root regenerates). AGENTS.md: ### Semantic
      justification pipeline subsection ONLY; verify read-only via git
      merge-base that its base contains the runner AGENTS.md merge when runner
      was assigned (else wait for the earlier engine wave); never touch Quick
      Commands/Tool Scope rows. No edits to tests/integration.py,
      tests/conftest.py. Runner touch: none. Emit a shift-report section in the
      epic close-up (or explicit no-shift declaration) with {justification-class
      description, added/removed finding keys, CHANGELOG snippet, evidence
      file:line} for the root handoff record.


      ## Requirements

      1. Contracts (ADR-010): keep check_if_meaningful signature +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate (rejections never reach backend).
      semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic
      stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when
      PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins
      both). No patching globals/imports, no private imports.

      2. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model), secrets-clean encoding. Normal lint read-only
      (hash-asserted zero writes); explicit refresh only (lockfile + merge +
      atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to
      linted files; drop empty-files + stale-model. Concurrency per pylint
      writer-first verdict (read the merged verdict; if pylint-cache-assumptions
      unmerged, root item lands first — do not invent semantics). Must pass all
      tools incl. detect-secrets.

      3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind
      get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but
      with no compliant model available the loader returns None (one warning,
      sentinel, heuristic stands). sentence-transformers dropped from [semantic]
      (proven: extra contains no sentence-transformers; uv.lock has no such edge
      for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn +
      ignore). Joined-rule cache keys + on-any-element matching owned here
      (extraction at call sites owned by checkers epic; either order converges).
      On shift: shift report + CHANGELOG, root regenerates.

      4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold
      tables into one deduped parametrized table (heuristic outcomes pinned);
      FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; delete vacuous `is None or ...` +
      ImportError-propagation test; mark the 4 pair tests slow (or delete with
      the reranker); modules <=500, no suppressions; never test linting.
      (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's
      work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model
      ships) is allowed, not required.

      5. Docs: rewrite semantic-justification.md (heuristic-gated backend +
      tracked cache + no-go status), custom-checks bullet, troubleshooting
      section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents,
      new/deprecated vars, cache file, no-go note).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches backend; one call per unique pair; scoped cleanup; no retry storm.

      - Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled
      comments (or shift report + root regen).

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned, empty baseline.
    slug: epic-semantic-infrastructure
techDebt:
  - category: blocking
    description: "Iteration-2 eval structural no-go: contracted accepted stratum
      215/0 makes 95% meaningless-precision unevaluable; all 183 repo labels
      single-author with terse borderlines all True. No model meets the bar by
      construction."
    id: TD3-B1
    resolution: "ADR-009: no model ships in iteration 3. Follow-up (outside this
      iteration): double-rated real brush-off sample repairing corpus
      construction + human Fastino license decision;
      epic-semantic-infrastructure builds backend/cache against FakeBackend so a
      compliant model plugs in via get_backend()."
  - category: blocking
    description: "M4 audit report completeness + unified-map drift: reports live in
      orchestration records; evidence lines may be stale at iteration-3 HEAD."
    id: TD3-B2
    resolution: ownership-map-revalidation re-globs HEAD and produces the validated
      map + drift list; epic-kickoff-gate resolves disputes before epic waves
      scale.
  - category: impacting
    description: Pylint writer/timing verdict may still be unmerged (iteration-2
      pylint-cache-assumptions running at close-up); cache concurrency design
      cannot be invented.
    id: TD3-I1
    resolution: pylint-cache-semantics-closure lands or verifies the single verdict
      file first; epic-semantic-infrastructure consumes it and must not invent
      lock/merge semantics.
  - category: impacting
    description: detect-secrets gate red on factory journals (environmental) +
      MemoryError on huge tracked artifacts in dirty worktrees.
    id: TD3-I2
    resolution: secrets-baseline-exclusion lands the approved ^\.factory/ filter in
      version-correct form after schema pre-validation (journals stay
      committed); final validation runs on scoped/clean checkout and cites
      mechanism + HEAD.
  - category: adjacent
    description: "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope
      row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8
      problem-statement ADRs partly stale; design/ vs docs/adr location split."
    id: TD3-A1
    resolution: "Decision rule applied at epic-kickoff-gate from the drift list;
      defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version +
      README pin, semantic owns pipeline subsection, root owns ADR
      reconciliation via the adr-formalization item (overwrite 009/010/011 stubs
      with full ADRs, create ADR-012.md, staleness notes on 001/005/006,
      docs/adr location cross-reference). Kickoff records assignments;
      unassigned rows stay with root."
  - category: adjacent
    description: "Over-limit modules with disables, dead compat shims, duplicated
      test helpers, milestone-ID test names, hardcoded checkout paths — split by
      owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py
      (511, incl. duplicate-disable collapse); checkers owns
      tests/checkers/_factories.py (1393); semantic owns
      tests/checkers/test_semantic_check.py (506)."
    id: TD3-A2
    resolution: Each epic resolves its owned rows per audit (register() disables
      exempt per ADR-012; mixin misc per attempt-with-fallback rule); each
      removal names a survivor; blocking-debt limbs pinned or explicitly
      flagged.
adrs:
  - consequences: No model ships in iteration 3; intent's swap clause is deferred
      until a compliant model is proven. Epics build backend/cache
      infrastructure against FakeBackend + tracked cache; model wiring is a
      bounded follow-up once the verdict lands. Close-up must not claim the swap
      complete.
    context: "Iteration-2 eval returned a structural no-go: contracted accepted
      stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision
      unevaluable by construction; all 183 repo labels single-author with terse
      borderlines all True. GLiDE-0.4B also needs Fastino license review; no
      candidate is proven compliant."
    decision: "Defer model implementation to a follow-up contingent on (a)
      double-rated real brush-off sample resolving the corpus-construction
      defect and (b) human Fastino license decision if GLiDE is recommended.
      Iteration 3 delivers everything model-independent: heuristic-first
      DecisionBackend + tracked cache infrastructure, runner/checkers debloat,
      docs reconciliation."
    id: ADR-009
    title: No-go-gated semantic implementation with infrastructure-first delivery
  - consequences: Backend/cache work proceeds against pinned contracts without
      waiting for the model verdict; a compliant model plugs in via
      get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path
      surface is test-only by construction, verified by a loader test.
    context: Cache schema, key encoding, prune policy, refresh command, writer
      identity/timing, and --path scoping were designed by iteration-2 spikes
      but the pylint writer verdict (cache-design-spike input) is still pending.
      The test-only dotted-path backend import would be an
      arbitrary-code-execution surface if honored in production lint.
    decision: "Adopt iteration-2 spike contracts as authoritative unless
      contradicted at HEAD: DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1] with heuristic-first
      hard gate; tracked JSON array .python-setup-decisions.json at linted root
      (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint
      read-only with hash-asserted zero writes; explicit CI-guarded refresh
      (lockfile + merge + atomic); prune empty-files + stale-model; writer-first
      concurrency verdict from pylint-cache-assumptions (merge pending item
      first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY
      when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint
      ignores it. A loader test pins both behaviors (honored under pytest;
      ignored with the marker removed)."
    id: ADR-010
    title: Adopt iteration-2 semantic spike contracts as build baseline
  - consequences: Subsystem epics start with dispute-free ownership; no concurrent
      shared-file edits (single-writer table); AGENTS.md conflicts avoided by
      heading split + engine wave order; M3 close-out consumes a single handoff
      record gated by the M2 replan.
    context: M4 audits merged with the unified 5-owner map but report completeness
      validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split,
      shared-file edits, packaging exceptions, and the epic-to-root shift-report
      handoff need machine-checkable definitions because no cross-epic
      dependency edges exist and agents must never run git writes.
    decision: "Re-validate the unified map at iteration-3 start (counts
      67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic
      epics in one wave. Epic assignment maps setup-testing files to
      epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py +
      setup/install tests). AGENTS.md split by exact rows with engine-enforced
      wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) +
      ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic
      justification pipeline subsection only; checkers never touches AGENTS.md;
      the engine schedules the runner AGENTS.md item in an earlier wave than the
      semantic pipeline item (order recorded at kickoff); semantic verifies
      read-only via git merge-base that its base contains the runner merge when
      runner was assigned, else waits. Shared-file single-writer table (no
      concurrent edits): checkers/_base.py = semantic only (checkers puts its
      stream helper in new checkers-owned _source_stream.py, zero _base.py
      diff); no_try_import_checker.py register() disable line +
      _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line);
      test_suppression file = checkers owns all lines except the
      TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper
      exemption list = checkers, with the peek_fallback_tools line
      preconditioned on reading the runner close-up (deleted iff runner confirms
      shim deletion). Packaging exception: semantic solely owns the pyproject
      [semantic] extra block + uv.lock regeneration (single writer, enumerated
      exception to root-owned repo-root files); .gitignore untouched (legacy
      .cache lines stay; decisions file committed); no hatch entry (tracked
      cache is consumer-runtime data, not wheel payload). Shift-report handoff:
      each epic emits a shift-report section or explicit no-shift declaration in
      its close-up report; M2 replanAfter:true is the enforceable gate (the
      engine schedules no M3 item until the replan after M2 epic close-ups);
      root epic-shift-report-collection is the first post-replan item, stays
      pending unless all three close-ups exist, and consolidates the handoff
      record that golden-regen-hatch consumes."
    id: ADR-011
    title: Validated-map epic decomposition with defined AGENTS split and shift
      handoff
  - consequences: "register() disables remain as documented exemptions counted as
      exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal
      is attempt-with-fallback: either clean removal or a standardized retained
      justification, both verifiable."
    context: "Every checker register(linter: PyLinter) omits @beartype with a
      missing-beartype disable citing PyLinter runtime-unavailability / circular
      import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import;
      dropping the disable retriggers the custom missing-beartype checker.
      Separately, 4 mixin checkers suppress a SourceRootMixin.options vs
      BaseChecker.options conflict (e.g. beartype_checker.py:21) whose
      removability via a shared typed base is unproven and may be blocked by
      pylint typing."
    decision: Retain the missing-beartype disable on all register() functions with a
      standardized justification (PyLinter is a pylint internal type unavailable
      at runtime for beartype; circular import). Annotation stays PyLinter under
      TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on
      mixin classes is attempted via a shared typed base; if pylint typing
      blocks removal, retain with the standardized justification and report the
      blocker — both outcomes satisfy the epic.
    id: ADR-012
    title: register() missing-beartype exemption for PyLinter circular import


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


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered the verifiable repo scope: M1 green baseline +
  14-tool contract (check-only ruff format strategy, single-sourced registry,
  14-site docs migration, SIM102/R0914/C0208/W9704-tail fixes, baseline []) and
  M2 test-infra consolidation + golden hardening (11 helpers single-sourced,
  integration.py 498 lines, caller asserts, shared slicer, golden
  byte-identical) — both verified at HEAD by the close-up audit. M3 partial:
  model matrix + CPU eval (structural no-go with disclosed single-adjudicator
  limits) + runtime-pinning no-go skip merged; test_pylint_cache_semantics.py
  still missing (pylint-cache-assumptions running, cache-design-spike pending on
  its verdict). M4: both audits merged per engine records; report completeness
  validates at the iteration-3 replan via HEAD re-glob per ADR-008. Secrets
  verdict is human-async and does not block dev acceptance. Task intent (rule
  enforcement, debloat, semantic swap) remains iteration-3 scope per plan; no
  operator blocker."


--- Prior Close-up closeup-3.yaml ---
iteration: 3
status: next-iteration
summary: "Iteration 3 partially delivered: M1 repo scope VERIFIED
  (.secrets.baseline:41-46 ^\\.factory/ filter, test_pylint_cache_semantics.py
  485 lines/19 tests writer-first verdict, 12 ADRs with 009-012 full +
  001/005/006 staleness + README cross-ref) but M1 gate NOT closed per engine
  records (ownership-map-revalidation running, epic-kickoff-gate pending; 3
  empty waves on the single-item bottleneck). M2 ZERO DELIVERY: runner
  dispatch.py:1 still 542-line disable, baseline.py:23-42 shims retained,
  _factories_extras.py:1,6 duplicate disables, hardcoded paths + self-lint tests
  retained; checkers no _source_stream.py, _legacy_scan retained,
  trivial_wrapper exemptions retained, mixin misc unattempted, _factories.py
  1393 unsplit, single-code rule args, no SEMANTIC=0 guards; semantic zero
  DecisionBackend/cache/FakeBackend, _semantic.py still jina reranker +
  ~/.cache, _base.py:238 exact-match, [semantic] still sentence-transformers. M3
  FAILS: baseline [] holds and golden exists, but docs must-contain fails
  everywhere and no shift/regen/gate-table evidence. Gates unverifiable under
  read-only audit. Intent (rule enforcement, debloat, model swap) remains future
  scope; no operator blocker."


--- Steering Directive/Answer (1794100866341.md) ---
Operator acknowledges all plan-1 awareness items: (1) material definition and its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is intentional, not a regression. (2) git-stored cache file at the linted repo root: OK as required by INTENT; document it in install docs, keep it detect-secrets clean, and note model weight licenses. (3) never-test-linting broadening and removing the pytest self-lint guard: OK, it matches the project's coding rules; the lint gate is the guard. No further action needed on these.


--- Steering Directive/Answer (1794128584028.md) ---
Operator acknowledges awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup: restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md counts and the cli help text is approved — add it (small dev kind, depends on the v3 line) when the wave-report next amends, or fold the two-line sync into the docs-counts-sync story if it is still pending. Pre-existing red lint/test baseline items stay out of story budgets. No other action.


--- Steering Directive/Answer (1794158471467.md) ---
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.


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


--- Decision 005-item-pylint-cache-assumptions.yaml ---
id: decision-pylint-cache-assumptions-1794139485507
context: item
item: pylint-cache-assumptions
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T12:04:45.507Z
rationale: "Both develop attempts rejected solely on scope creep, not on the
  assumption tests themselves: diff leaked into M1-owned files (src
  stub/coverage.py SIM102 fix, src runner/cli.py locals, 6 tests/runner 13->14
  migrations) plus a .secrets.baseline side-effect write. The item's contract is
  one new file, tests/assumptions/test_pylint_cache_semantics.py, zero src
  changes. Reverting the out-of-scope files unblocks merge; no split/escalate
  needed."
text: "Retry granted. Fix in this order: (1) Revert to HEAD exactly:
  .secrets.baseline, src/python_setup_lint/checkers/stub/coverage.py,
  src/python_setup_lint/runner/cli.py (`git diff --` on each must be empty).
  NEVER run bare `uv run lint` or any detect-secrets scan that rewrites
  .secrets.baseline (run only `uv run pytest
  tests/assumptions/test_pylint_cache_semantics.py -q`). (2) Revert all
  tests/runner/** edits (factories, extra_tools, lint_runner, stats, t3, fakes)
  — owned by runner-format-contract, parallel race. (3) Diff must contain
  exactly ONE file: tests/assumptions/test_pylint_cache_semantics.py
  (writer-first: writer + timing + --path scoping verdict, no_external_api
  marker, test_<api>_given_<condition>_then_<expected> names, offline, no src
  imports beyond reading). (4) Verify: `git diff --stat` shows only that file;
  new tests pass; touched file ruff/format clean. Pre-existing SIM102/R0914/6
  tool-count failures persist by design — do not fix, do not baseline. Record
  the writer/timing verdict (crash-safe lock vs runner post-merge vs
  jobs=1/sidecars-if--j) plus --path sweep scope in the report for
  cache-design-spike."
persist: true


--- Decision 006-item-model-eval-poc.yaml ---
id: decision-model-eval-poc-1794148393249
context: item
item: model-eval-poc
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:33:13.249Z
rationale: "Single display bug blocks approval: report.py:250 renders Recall
  column from precision instead of meaningful_recall. Metrics, best-cell
  selection (lines 240-244), compliance table 4.4, and verdict are already
  correct, so a one-line render fix plus report.md regeneration unblocks merge;
  no split/escalate needed."
text: "Fix exactly one line in the poc folder (production paths untouched):
  report.py:250 change pct(precision and precision) to
  pct(accepted['meaningful_recall']). Regenerate report.md section 4.3 (lines
  209-215) from metrics.json. Verify displayed values: decider-nano rubric
  0.5/veto Recall 27.9% (not 3.1%), bekko rubric 37.7% (not 11.8%), ettin/minilm
  100% (not n/a). Confirm best-cell selection and compliance table 4.4 unchanged
  and verdict unaffected. Do not touch metrics computation, corpus, or selection
  logic."
persist: false


--- Decision 007-item-test-debloat-audit-i2.yaml ---
id: decision-test-debloat-audit-i2-1794158623946
context: item
item: test-debloat-audit-i2
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T17:23:43.946Z
rationale: "All 10 fix requests verified as factual regressions from r1 to r2
  (spot-checked: cli.py:292-367 has force-fix/format/cwd/config-status beyond
  MAIN_ARGPARSE_CASES; _SHIPPED_CONFIG_FILES has 11 labels; smoke test is the
  sole default full-pipeline pin). Root cause is methodological: r2 counted defs
  not collected tests, invented owner tokens, and dropped r1
  clusters/limbs/reservations. The unified-map inter-dep file exists in-repo, so
  alignment is mechanical. One guided rewrite of the report (zero repo writes)
  unblocks merge; no split/escalate needed."
text: "Retry granted. Rewrite the report (report-only, zero repo writes) fixing
  all 10 in this order: (1) Owners: restore the unified-map 5-owner scheme
  exactly (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15)
  from coding-rules-audit-i2 output.yaml:82-88; delete the 10 invented tokens;
  test_suppression file stays checkers-file with
  TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. (2) N|S
  counts: re-derive EVERY row from per-file `pytest --collect-only` truth
  (default|slow), never def counts; fix the ~25 listed files (e.g.
  semantic-check 82|3, threshold 80, lint-runner 58, stats 87). (3) Pinning:
  restore all ~15 blocking-debt limbs from r1 (cli --force-fix+env, --format,
  --cwd, --config-status; 11-label vs 7-label config gap; mypy/rumdl/ty
  _config_flag_for branches; dispatch scopes
  ty-src/pylint-pyi-src/pylint-tests-tests/tach-whole-repo; pyright tests/** and
  rumdl tests/data exclusions) — grep-verify each has zero pins. (4) Self-lint
  removals: list all six groups (noise-filter, TestModuleSizeGates,
  private-imports AST scan, autofix-conflict slow, downstream-integration
  home-write, t9_7 hardcoded checkout) with surviving gates. (5) Reservations:
  restore epic verbatim (tests/checkers/conftest.py, tests/assumptions
  runtime/decision/cache, _decision_backend/_decision_cache); delete invented
  runner/runtime paths; tests/conftest.py is root-owned. (6) Symbols: restore
  _base.py:143-238 check_if_meaningful (+pyi) and no_try_import
  _OPTIONAL_IMPORT_PATTERNS exclusions. (7) Duplicates: restore duplicate-of for
  _make_tc x13, _walk_and_release x10, _msg_ids x8, t3-vs-stats
  parser-completeness exact dup, autofix fake-vs-git, setup 6x install,
  _UvCallRecorder x2 — or explicitly justify each drop. (8) Keep
  test_real_pipeline_smoke.py (sole default full-pipeline pin; integration.py is
  explicit-only) or name a default-collected survivor. (9) Slow budget:
  recompute from truth (baseline-edge 16|2 both in TestPerfBenchmark,
  suppression 40|2) — 18->13 not 14. (10) Runtime: restore integration 65-107s
  with conditions (WSL2/py3.14.4/warm-cache ±30%). Verify: owners match unified
  map exactly; every N|S matches --collect-only; every limb/gap above named."
persist: true


--- Decision 008-item-ownership-map-revalidation.yaml ---
id: decision-ownership-map-revalidation-1794173664936
context: item
item: ownership-map-revalidation
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T21:34:24.936Z
rationale: Two factual accuracy defects block an otherwise complete revalidation
  report; both are mechanical recount/wording fixes with zero repo writes. No
  split/escalate needed.
text: "Fix exactly two report defects in the fact-finder output (zero repo
  writes, zero git writes): (1) Section 0 revision-leg delta: replace '7 first
  leg / 4 second leg' with verified `git diff --name-only` truth — first leg 4
  files, second leg 4 files, all .factory only with zero files under
  src/scripts/tests, 7 unique end-to-end (state all three numbers with the
  overlap explained). (2) Factory tracked count: recount `git ls-files .factory
  | wc -l` AT the pinned HEAD 5a6f200 (not working tree) and replace stale 615
  with the verified count (reviewer says 621 — confirm by recount, cite command
  + HEAD + count); if the count moved because HEAD advanced, re-pin to current
  HEAD short SHA and update the map-<SHA> revision ID consistently everywhere.
  Re-verify: ownership counts 67/83/15/4/15 ±5 still hold after recount; drift
  list unchanged; no other sections touched."
persist: false


--- Decision 009-nonitem.yaml ---
id: decision-nonitem-1794178741560
context: non-item
decision: fix-item
timestamp: 2026-11-08T22:59:01.560Z
rationale: "Single-item bottleneck: 3/4 schedulable M1 items merged (secrets,
  pylint-closure, adr-formalization); ownership-map-revalidation is the only
  running/schedulable item while epic-kickoff-gate and all M3 items are
  dep-blocked, so stalled validation yields empty waves with Blocked:(none).
  Original scope bundles kickoff-blocking core (counts, exclusions,
  reservations, revision) with non-blocking consumer inputs (exact stream-block
  re-pin, docs-row full validation), maximizing QA surface on a report-only
  item. Narrowing to the mergeable core unblocks kickoff; deferred inputs are
  re-pinned by consumers without loss."


## Steering Directives
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
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


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
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


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
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
      path/class/function names; golden+counts byte-identical; MUST NOT touch
      AGENTS.md, docs/**, or src/** (test-only enforcement) — AGENTS.md counts +
      cli.py help sync moved to docs-counts-sync follow-up, leave stale by
      design. Acceptance: integration, `pytest -q` pass; golden+counts
      byte-identical; no new lint violations in touched files (pre-existing
      SIM102/R0914/C0208 persist)."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
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
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
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
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
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
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Follow-up to consolidate (test-only, cannot touch docs/prod).
      Update AGENTS.md test/tool counts from stale base (1290 pass / 13 tools)
      to runtime actuals (verify: `uv run pytest --collect-only -q` count incl.
      new assumption/golden tests + len(TOOLS)==14), count lines only (epic owns
      AGENTS.md pipeline section, never touch); and
      src/python_setup_lint/runner/cli.py:314 help text ('all 13 tools' → 'all
      14 tools'). Prod scope strictly bounded to that one help string (no
      behavior change). No test changes; golden+counts byte-identical.
      Acceptance: counts match runtime; `uv run pytest tests/integration.py -v`
      passes; no new lint violations in touched lines."
    kind: dev
    milestoneId: M2
    slug: docs-counts-sync
    title: Sync AGENTS.md counts and cli help to 14-tool world
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


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
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


--- Prior Plan plan-2.1.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
  - deps:
      - baseline-violations-fix
    description: "Close the M1 green-baseline tail: wave-2 report lists lint still
      red, and the two W9704 sites from infra notes
      (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
      options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore
      site) were never owned by any item (TD2-B2 omitted them). Steps: (1)
      Reproduce current failures via the declared gates (format check + 13-tool
      lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**;
      capture exact remaining violations. (2) Fix with
      justification-comment-only edits (no behavior change; red-test-exempt like
      baseline-violations-fix): strengthen trailing justifications so the
      justification checker accepts. If additional violations appear, fix only
      if trivially behavior-preserving, else record as debt in the report — do
      not balloon scope. FORBIDDEN: lint.baseline edits (stays []),
      tests/data/** changes, golden regen, unrelated refactors,
      .secrets.baseline, factory records. Secrets-triage verdict is human-async
      and out of scope. Verify: lint gate zero violations in src/** and
      tests/**; `pytest -q` + integration show no new failures; golden
      byte-identical; touched files format-clean."
    kind: story
    milestoneId: M1
    prodBudgetHint: 5
    slug: remaining-lint-violations-fix
    title: Fix remaining src/tests lint violations (W9704 tail)
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-3.yaml ---
iteration: 3
milestones:
  - directionalInterfaces:
      - "Validated unified map: owner enum
        {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15
        (±5 drift budget per owner, total equal to the git-ls-files recount);
        epic assignment maps setup-testing files to epic-runner-modernize;
        ownership universe = src/** + scripts/** + tests/** EXCLUDING
        tests/data/**; root-owned group (tests/data, config, docs, repo-root
        files, epics read-only except enumerated packaging exception);
        symbol-exclusion column (incl. _base.py:238 rule-echo line and
        no_try_import register line as semantic-owned); planned-path
        reservations (incl. tests/checkers/conftest.py as reservation); drift
        list in {path, auditRef, headEvidence, disposition:
        confirmed|corrected|disputed}. Artifact = item-report tables with
        revision map-<HEAD short SHA> (durable orchestration records)."
      - .secrets.baseline filters_used gains the ^\.factory/ should_exclude_file
        entry in the version-correct form (schema pre-validated against
        installed detect-secrets); journals stay committed; M1 acceptance cites
        mechanism + pinned HEAD, not finding counts.
      - Pylint writer-first verdict (writer + timing + --path scoping) readable
        from tests/assumptions/test_pylint_cache_semantics.py report;
        cache-design-spike input satisfied.
      - "AGENTS.md split by exact rows with engine wave order: runner-owned (if
        assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope
        table (add ruff format row); semantic-owned = ### Semantic justification
        pipeline subsection only; checkers never touches AGENTS.md; the engine
        schedules the runner AGENTS.md item in an earlier wave than the semantic
        pipeline item (order recorded at kickoff with post-kickoff HEAD);
        semantic verifies read-only via git merge-base that its base contains
        the runner merge when runner was assigned, else waits. Agents perform
        zero git writes."
      - "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the
        drift list; defaults = runner owns counts/scope/version/pin rows,
        semantic owns pipeline subsection, root owns ADR reconciliation via
        adr-formalization. Shared-file single-writer table: checkers/_base.py =
        semantic only; _source_stream.py = checkers (new file); no_try_import
        register line + patterns = semantic; test_suppression class block =
        semantic, rest = checkers; trivial_wrapper peek line preconditioned on
        runner close-up."
    id: M1
    scenarios:
      - >-
        Scenario: Ownership map validated
          Given iteration-2 audit reports plus HEAD
          When ownership-map-revalidation re-globs via git ls-files and recounts
          Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>
      - >-
        Scenario: Secrets gate green by mechanism
          Given the schema pre-validation plus the .factory/ exclusion merged
          When detect-secrets scans git ls-files on a clean checkout
          Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only
      - >-
        Scenario: Epic kickoff gated on validated artifacts
          Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion
          When epic-kickoff-gate completes
          Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)
    title: Validated decomposition and green-gate preconditions
  - directionalInterfaces:
      - "Epic runner (owns runner/** + setup-testing files): dispatch.py split
        into modules each ≤500 lines with zero too-many-lines/complexity
        suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced
        re-exports); baseline.py compat shims deleted (or kept with in-repo
        consumer evidence + debt note); tests/runner/_factories_extras.py split
        with duplicate disables collapsed; each test removal/merge names its
        survivor; shift report or no-shift declaration emitted in the epic
        close-up."
      - "Epic checkers: shared stream helper in NEW checkers-owned
        _source_stream.py replacing the drift-list-pinned block list
        (grep-verified zero remaining copies), ZERO _base.py diff from this
        epic; register() keeps only the ADR-012 missing-beartype justification
        with no @beartype added (no_try_import register line skipped —
        semantic-owned); type-ignore[misc] removal attempted via shared typed
        base with retain-and-report fallback; _legacy_scan renamed with all call
        sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek
        line preconditioned on runner close-up; tests/checkers/_factories.py
        split by checker group with ParameterSet typing; W9704/W9738 callers
        emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic
        tests; 40 W9704 + 11 W9738 heuristic outcomes pinned."
      - "Epic semantic (sole _base.py writer): DecisionBackend Protocol
        decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with
        FakeBackend kwarg/env injection tests; dotted-path honored only under
        PYTEST_CURRENT_TEST with loader test pinning both behaviors;
        .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no
        bare hex>=20, secrets-clean); read-only lint proven by hash-asserted
        zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra
        without sentence-transformers with loader-returns-None + one-warning
        proof (no hatch entry, .gitignore untouched); rule-echo on-any-element
        change at _base.py:238 with joined cache keys; merged deduped heuristic
        table; docs state backend + cache + no-go."
    id: M2
    replanAfter: true
    scenarios:
      - >-
        Scenario: Runner modernized without behavior drift
          Given the runner + setup-testing scope from the validated map
          When its items merge
          Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record
      - >-
        Scenario: Checkers modernized without behavior drift
          Given the checkers epic scope with semantic exclusions
          When its items merge
          Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported
      - >-
        Scenario: Semantic infrastructure ready for a future model
          Given the ADR-009 no-go verdict
          When the semantic epic merges
          Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported
    title: Subsystem modernization via three epics
  - directionalInterfaces:
      - "Shift-report handoff contract: each epic emits a shift-report section
        or explicit no-shift declaration in its close-up report with
        {justification-class description, added/removed finding keys, CHANGELOG
        snippet, evidence file:line}; M2 replanAfter:true is the enforceable
        gate (the engine schedules no M3 item until the replan after M2 epic
        close-ups); epic-shift-report-collection is the first post-replan item
        and stays pending unless all three close-ups exist (fails open, never
        fabricates); golden-regen-hatch consumes only the handoff record; review
        record = regen-hatch report with key-by-key diff (or no-op
        attestation)."
      - "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only
        (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run;
        key-by-key diff review against the handoff shift report; golden + tool
        counts committed together; no blind regen ever."
      - "Final gate table: format exit code; lint per-tool results on scoped
        checkout; pytest counts (pass/skip/deselect); integration
        9-collected-0-failed with pre-commit env pinned (9 passed with it, 7
        passed + 2 skipped without); golden hash equality or regen diff;
        lint.baseline []; docs reconciliation checklist with must-contain
        strings (semantic-justification.md: DecisionBackend,
        .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md:
        DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER
        deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] +
        no-go; AGENTS.md counts reconciled to the 9-collected contract +
        ruff-format scope row; CHANGELOG version; README pin; ADR staleness
        notes per kickoff assignment). Red-cell routing: red cells route back
        via new root items (root-owned files) or epic follow-up items
        (epic-owned files), never baseline edits."
    id: M3
    scenarios:
      - >-
        Scenario: Golden integrity preserved
          Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)
          When golden-regen-hatch runs
          Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs
      - >-
        Scenario: Iteration closes with evidence
          Given all epic merges via the handoff record
          When final-gate-validation completes
          Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit
    title: Behavior-preservation close-out and gate evidence
uncertainties:
  - description: Audit evidence may have drifted since iteration 2 (file:line moves,
      renames, merged items). Epic scopes built on stale rows would misfire.
    id: U1
    spikeOutlines:
      - "ownership-map-revalidation (fact-finder, zero writes): re-glob HEAD,
        confirm 5-owner counts + exclusions + reservations, emit drift list"
  - description: Whether any compliant decision model exists is unknown
      (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino
      review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral —
      no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample,
      license decision, CPU benchmark).
    id: U2
  - description: Cache concurrency semantics (writer identity/timing, --path
      scoping) depend on the pylint verdict file, which may still be unmerged.
    id: U3
    spikeOutlines:
      - "pylint-cache-semantics-closure (test-assumptions): land or verify the
        single verdict file; epic consumes it, never invents"
itemOutlines:
  - deps: []
    description: "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for
      the ownership universe via git ls-files filtered to src+scripts+tests
      minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner
      with total equal to the recount. Confirm symbol exclusions
      (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo
      line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test
      modules + TestSuppressionRerankerPipeline class block), planned-path
      reservations (incl. tests/checkers/conftest.py as reservation, not an
      owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin
      the exact stream read/decode block list + helper signature for the
      checkers epic. Output: validated map with revision map-<HEAD short SHA> +
      drift list in {path, auditRef, headEvidence, disposition:
      confirmed|corrected|disputed} consumed by all three epics. Zero repo
      writes."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: ownership-map-revalidation
    title: Re-validate unified ownership map at HEAD
  - deps: []
    description: "Land the operator-approved exclusion so the lint gate is green on
      clean checkouts. Pre-validate the filters_used schema against the
      installed detect-secrets version first (should_exclude_file signature;
      list-pattern vs scalar form) and use the version-correct form; then insert
      the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line
      40), keeping journals committed. Verify: full git-ls-files detect-secrets
      scan exits 0 on clean checkout while a planted control secret still exits
      1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk
      caveat (write-time redaction + periodic unfiltered audits). No other
      baseline edits."
    kind: story
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-baseline-exclusion
    title: Add .factory/ exclusion to .secrets.baseline
  - deps: []
    description: "Close the iteration-2 M3 gap if still unmerged at iteration-3
      start: EXACTLY ONE new file
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>, offline, no src writes).
      Writer-first: writer + timing + --path scoping verdict (crash-safe lock vs
      runner post-merge vs jobs=1/sidecars-if--j). If the iteration-2 item
      already merged, this item verifies the verdict exists and is readable;
      otherwise it lands the file. Verdict feeds epic-semantic-infrastructure
      cache concurrency (epic must not invent semantics)."
    kind: test-assumptions
    milestoneId: M1
    prodBudgetHint: 0
    slug: pylint-cache-semantics-closure
    title: Land or verify pylint writer/timing verdict
  - deps:
      - ownership-map-revalidation
      - pylint-cache-semantics-closure
      - secrets-baseline-exclusion
    description: "Root-owned coordination checkpoint (report-only, zero repo
      writes). Confirm the three epics consumed the validated map revision +
      drift list, the pylint verdict is readable, and the .secrets.baseline
      exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave
      order (runner item in an earlier wave than the semantic pipeline item when
      runner is assigned, with the read-only merge-base verification rule), the
      shared-file single-writer table, and docs-row assignments from the drift
      list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG
      version + README pin; semantic owns pipeline subsection; root owns ADR
      reconciliation via adr-formalization). Resolve any ownership dispute by
      amended assignment before epic waves scale. Output: gate report with
      consumed revision ID, per-epic ownership tables, wave order, docs
      assignments, and zero unresolved disputes (each resolved dispute cites its
      amended assignment reference)."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: epic-kickoff-gate
    title: Epic kickoff and ownership-dispute gate
  - deps: []
    description: "Root-owned ADR lifecycle (docs only, root-owned files): overwrite
      the docs/adr/ADR-009/010/011 problem-statement stubs with full
      Context/Decision/Consequences ADRs matching this plan, create
      docs/adr/ADR-012.md for the register() exemption, add staleness notes to
      ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md
      pointer to design/ per CodingRules). Verify: 12 ADR files each carry
      Context/Decision/Consequences or an explicit staleness note; rumdl clean;
      no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs
      assignment)."
    kind: story
    milestoneId: M1
    prodBudgetHint: 0
    slug: adr-formalization
    title: Formalize ADRs 009-012 and reconcile stale ADRs
  - deps:
      - epic-kickoff-gate
    description: "Root-owned fan-in (report-only, zero repo writes). M2
      replanAfter:true is the enforceable gate: the engine schedules this item
      only in a post-replan wave after M2 epic close-ups exist. Read the three
      epic close-up reports; extract each epic's shift-report section (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line};
      consolidate into one handoff record with exactly 3 epic sections. If any
      close-up is missing, the item stays pending (fails open — never
      fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff
      record has exactly 3 epic sections, each either a shift report or an
      explicit no-shift declaration."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: epic-shift-report-collection
    title: Consolidate epic shift reports into handoff record
  - deps:
      - epic-shift-report-collection
    description: "Root-owned regen hatch, executed ONLY on a reviewed shift report
      in the handoff record (heuristic outcome change, e.g. joined-rule
      encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI),
      verify byte-identical double run, review the added/removed diff key-by-key
      against the shift report's justification-class description, commit golden
      + tool counts together. If all three handoff sections declare no-shift,
      this item is a no-op verification (golden byte-identical). NEVER
      blind-regen. Output: regen report with key-by-key diff review (or no-op
      attestation) consumed by final-gate-validation."
    kind: story
    milestoneId: M3
    prodBudgetHint: 0
    slug: golden-regen-hatch
    title: Conditional golden regen on reviewed shift report
  - deps:
      - golden-regen-hatch
    description: "Root-owned final validation (report-only, zero repo writes):
      format gate exit 0; lint gate green on scoped clean checkout for
      detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green
      (count + skips recorded); integration 9-collected-0-failed with pre-commit
      env pinned (9 passed with it installed, 7 passed + 2 skipped without);
      golden byte-identical or regen-with-reviewed-diff per the hatch report;
      lint.baseline []; docs reconciliation verified with must-contain strings
      (semantic-justification.md: DecisionBackend, .python-setup-decisions.json,
      ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md:
      DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend;
      CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the
      9-collected contract + ruff-format scope row; CHANGELOG version; README
      pin; ADR staleness notes per kickoff assignment). Record final gate table
      for close-up. Red-cell routing: red cells route back via new root items
      (root-owned files) or epic follow-up items (epic-owned files) — fixes go
      back to items, never to baseline edits."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: final-gate-validation
    title: Final gate table and docs reconciliation check
assumptions:
  - assumption: Material behavior = golden 158 findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Heuristic rejections are material; model accept/reject was
      never material (dormant path). Tightening remains intentional when a model
      eventually ships.
    disposition: confirm with human
    why: Preserves the iteration-1/2 operator-approved boundary; golden stays the
      mechanical contract.
  - assumption: Iteration-2 spike reports (candidate matrix, CPU eval no-go,
      runtime-pinning skip, pylint writer verdict if merged, coding-rules +
      test-debloat audits) are durable and readable at replan per ADR-008;
      validation re-globs HEAD.
    why: Plan-2 ADR-008 durability decision; verified pattern for both audits.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Any real-model test is slow + with_real_api, never in the
      default suite.
    why: Matches current venv and keeps gates offline, fast, deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration contracts are retained."
    disposition: confirm with human
    why: Operator-approved in iteration 1; removes gate-duplicating tests without
      deleting the fit-for-purpose contract.
  - assumption: detect-secrets MemoryError on huge tracked artifacts is
      environmental (worktree state), not a product violation; validate on
      clean/scoped checkout; never weaken baseline or exclude product paths.
    why: Context-pack measurement; baseline stays [] by design.
  - assumption: "Operator's secrets answers stand: journals stay committed;
      ^\\.factory/ filter lands in .secrets.baseline filters_used (task-branch
      commit); harness filter-seeding is a follow-up outside this task."
    why: Steering directive 1794158471467; M1 acceptance cites mechanism + pinned
      HEAD.
  - assumption: Integration gate contract is 9 collected, 0 failed with pre-commit
      env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped
      via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands
      integration row is reconciled to this contract, not unconditional 9/9 or
      stale 7 pass.
    why: tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional
      9/9 fails on minimal envs while stale 7 pass under-reports.
  - assumption: "Iteration 3 ships semantic infrastructure only (DecisionBackend,
      tracked cache, FakeBackend, docs); the headline model swap is NOT complete
      at close-up and must not be claimed as such. Follow-up triggers:
      double-rated real brush-off sample repairing the 215/0 corpus defect,
      human Fastino license decision if GLiDE is recommended, CPU latency/RSS
      benchmark on the chosen runtime."
    disposition: confirm with human
    why: ADR-009 no-go gating; operator must approve infra-only close-up per review
      human-awareness item.
  - assumption: Epics are first-class plan output for root tasks (same model as
      iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8
      in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12,
      semantic ≤10 items) are enforced when each epic's own plan is reviewed.
    why: The plan schema defines child-epic spawning for root tasks; epic-internal
      items live in child plans with their own review, not in the root item
      list.
epics:
  - intent: >-
      # epic-runner-modernize


      Child epic of `modernize`. Own per validated map: runner/** (src + tests +
      stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py,
      setup/install tests). Out of scope: checkers/**, semantic symbols,
      tests/data/** (read golden for verification only; NEVER write — regen is a
      root item), tests/checkers/**. Advisory budget: ≤12 items.


      ## Requirements

      1. CodingRules enforcement: remove all complexity suppressions by
      refactoring (dispatch.py 542-line disable -> split
      registry/strategies/parser-sets into modules each <=500 with single-source
      re-exports; no threshold raises). Delete dead compat (baseline.py
      peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting
      tests) unless external-consumer evidence is found in-repo (then record and
      keep). Remove redundant wrappers/fallbacks per audit rows. Split
      tests/runner/_factories_extras.py (511 lines; collapse the duplicate
      disables) by group.

      2. Test debloat per test-debloat-audit rows: merge overlapping
      baseline-diff/runner-stats/t3 parser-completeness coverage (exact
      duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting
      groups owned by runner (self-lint, config-consistency, noise-filter,
      private-imports scan, hardcoded-checkout live test) mapping each intent to
      golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename
      milestone-ID test files by behavior (keep class/function contract names
      where gates reference them).

      3. Keep test intent: every removal/merge names its survivor (golden
      scenario, assumption test, or retained unit test); default suite keeps a
      full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected
      survivor named).

      4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands
      rows (:9-11) + ## Tool Scope table (add ruff format row); the engine
      schedules this item in an earlier wave than the semantic pipeline item
      (order in kickoff report); record the merge HEAD for semantic's read-only
      merge-base verification. If unassigned, propose count/scope diffs in the
      close-up report for the root docs follow-up; never touch other sections.

      5. Shift reports: emit a shift-report section in the epic close-up (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line} for the
      root handoff record.

      6. Contracts: golden 158 findings + tool counts byte-identical unless a
      reviewed regen is requested via shift report (root regenerates);
      lint.baseline stays [].


      ## Acceptance

      - runner/** + setup-testing files have zero too-many-lines/complexity
      suppressions; all modules <=500 lines; dispatch registry still
      single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).

      - Compat shims deleted (or kept with in-repo consumer evidence + debt
      note).

      - Removed tests each map to a survivor; blocking-debt limbs from the audit
      either pinned by new tests or explicitly flagged.

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned; golden byte-identical or
      shift-reported.
    slug: epic-runner-modernize
  - intent: >-
      # epic-checkers-modernize


      Child epic of `modernize`. Own per validated map: checkers/** (src + tests
      + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch,
      zero diff from this epic): checkers/_semantic.py+.pyi,
      _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo
      line (this epic makes ZERO _base.py edits — its stream helper lives in new
      checkers-owned _source_stream.py),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's
      register() disable line (semantic standardizes it alongside the patterns),
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class block. Planned-path reservations for
      semantic modules are read-only. Out of scope: runner/**, tests/data/**
      (read-only), other test dirs, AGENTS.md (never touch). Advisory budget:
      ≤12 items.


      ## Requirements

      1. CodingRules enforcement on checkers/**: shared stream read/decode
      helper in NEW _source_stream.py replacing the drift-list-pinned block list
      (audit-estimated ~15; exact list + helper signature pinned at re-glob;
      grep-verified zero remaining copies); register() keeps the ADR-012
      missing-beartype justification (no @beartype added; skip
      no_try_import_checker.py's register line — semantic-owned);
      type-ignore[misc] on mixin classes: attempt removal via a shared typed
      base, fallback retain with standardized justification + reported blocker
      (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path)
      with all call sites updated; trivial_wrapper_checker: remove dead
      _legacy_* exemptions unconditionally, remove the peek_fallback_tools
      exemption ONLY after reading the runner close-up confirming shim deletion
      (if runner kept it, keep the exemption); split or slim over-limit modules
      (never raise thresholds); fix .pyi fidelity/private-symbol rows from the
      audit.

      2. Test debloat per test-debloat-audit rows: split
      tests/checkers/_factories.py (1,393 lines) by checker group with
      ParameterSet typing and cases next to tests; inline the 10 local
      _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers;
      remove unused factory helpers; fix test naming toward
      test_<method>_given_<condition>_then_<expected> for touched files; remove
      never-testing-linting checker tests only if the audit lists them (with
      survivors).

      3. Joined-code extraction at W9704/W9738 call sites (this epic owns the
      caller files): extract all suppressed codes via existing patterns,
      normalize/sort/join ',' as the rule argument (bare-except keeps single
      symbol). The on-any-element matching lives in the semantic-owned body;
      either merge order converges to the same final state (extraction alone is
      echo-neutral under exact match; matching alone is a no-op for single
      codes), so no cross-epic ordering is needed — if outcomes shift, emit a
      shift report. Never edit check_if_meaningful itself.

      4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0
      guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except
      the semantic-owned pipeline class block, which this epic does not touch).

      5. Shift reports: emit a shift-report section in the epic close-up (or
      explicit no-shift declaration) with {justification-class description,
      added/removed finding keys, CHANGELOG snippet, evidence file:line} for the
      root handoff record.

      6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged
      on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled
      corpora; lint.baseline stays [].


      ## Acceptance

      - Zero copied stream blocks outside _source_stream.py; zero _base.py diff;
      register() functions carry only the ADR-012 justification; mixin misc
      suppressions removed or retained-with-justification per the attempt rule;
      no over-limit checker module with a disable.

      - _factories.py split with no behavior change; local helper duplicates
      eliminated; callers emit joined codes.

      - All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or
      with reviewed shift report + root regen).

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned; golden byte-identical or
      shift-reported.
    slug: epic-checkers-modernize
  - intent: >-
      # epic-semantic-infrastructure


      Child epic of `modernize`. Implement the model-INDEPENDENT semantic
      infrastructure now; model wiring waits on the corpus-repair + license
      verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files:
      checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new
      private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype,
      structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in
      checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate +
      backend injection + rule-echo on-any-element matching for joined codes:
      _base.py:238 exact-match becomes any-element match over comma-joined
      sorted codes; backward-compatible no-op for single codes);
      _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in
      no_try_import_checker.py; pyproject [semantic] extra block + uv.lock
      regeneration (enumerated packaging exception, single writer; .gitignore
      untouched — legacy .cache lines stay, decisions file committed; NO hatch
      entry — tracked cache is consumer-runtime data, not wheel payload); docs
      (semantic-justification.md rewrite, custom-checks.md bullet,
      troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG
      user-visible); tests: test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class block, new runtime-assumption
      modules under tests/assumptions/ (append-only; never touch root __init__ +
      3 contract modules + test_pylint_cache_semantics.py).
      tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not
      exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).


      Protocol with root: NEVER write tests/data/** (read golden for
      verification only); on heuristic shift emit shift report + CHANGELOG
      behavior description (root regenerates). AGENTS.md: ### Semantic
      justification pipeline subsection ONLY; verify read-only via git
      merge-base that its base contains the runner AGENTS.md merge when runner
      was assigned (else wait for the earlier engine wave); never touch Quick
      Commands/Tool Scope rows. No edits to tests/integration.py,
      tests/conftest.py. Runner touch: none. Emit a shift-report section in the
      epic close-up (or explicit no-shift declaration) with {justification-class
      description, added/removed finding keys, CHANGELOG snippet, evidence
      file:line} for the root handoff record.


      ## Requirements

      1. Contracts (ADR-010): keep check_if_meaningful signature +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate (rejections never reach backend).
      semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic
      stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when
      PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins
      both). No patching globals/imports, no private imports.

      2. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model), secrets-clean encoding. Normal lint read-only
      (hash-asserted zero writes); explicit refresh only (lockfile + merge +
      atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to
      linted files; drop empty-files + stale-model. Concurrency per pylint
      writer-first verdict (read the merged verdict; if pylint-cache-assumptions
      unmerged, root item lands first — do not invent semantics). Must pass all
      tools incl. detect-secrets.

      3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind
      get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but
      with no compliant model available the loader returns None (one warning,
      sentinel, heuristic stands). sentence-transformers dropped from [semantic]
      (proven: extra contains no sentence-transformers; uv.lock has no such edge
      for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn +
      ignore). Joined-rule cache keys + on-any-element matching owned here
      (extraction at call sites owned by checkers epic; either order converges).
      On shift: shift report + CHANGELOG, root regenerates.

      4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold
      tables into one deduped parametrized table (heuristic outcomes pinned);
      FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; delete vacuous `is None or ...` +
      ImportError-propagation test; mark the 4 pair tests slow (or delete with
      the reranker); modules <=500, no suppressions; never test linting.
      (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's
      work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model
      ships) is allowed, not required.

      5. Docs: rewrite semantic-justification.md (heuristic-gated backend +
      tracked cache + no-go status), custom-checks bullet, troubleshooting
      section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents,
      new/deprecated vars, cache file, no-go note).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches backend; one call per unique pair; scoped cleanup; no retry storm.

      - Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled
      comments (or shift report + root regen).

      - Gates: format exit 0, scoped lint zero violations, `pytest -q` green,
      integration 9-collected-0-failed with env pinned, empty baseline.
    slug: epic-semantic-infrastructure
techDebt:
  - category: blocking
    description: "Iteration-2 eval structural no-go: contracted accepted stratum
      215/0 makes 95% meaningless-precision unevaluable; all 183 repo labels
      single-author with terse borderlines all True. No model meets the bar by
      construction."
    id: TD3-B1
    resolution: "ADR-009: no model ships in iteration 3. Follow-up (outside this
      iteration): double-rated real brush-off sample repairing corpus
      construction + human Fastino license decision;
      epic-semantic-infrastructure builds backend/cache against FakeBackend so a
      compliant model plugs in via get_backend()."
  - category: blocking
    description: "M4 audit report completeness + unified-map drift: reports live in
      orchestration records; evidence lines may be stale at iteration-3 HEAD."
    id: TD3-B2
    resolution: ownership-map-revalidation re-globs HEAD and produces the validated
      map + drift list; epic-kickoff-gate resolves disputes before epic waves
      scale.
  - category: impacting
    description: Pylint writer/timing verdict may still be unmerged (iteration-2
      pylint-cache-assumptions running at close-up); cache concurrency design
      cannot be invented.
    id: TD3-I1
    resolution: pylint-cache-semantics-closure lands or verifies the single verdict
      file first; epic-semantic-infrastructure consumes it and must not invent
      lock/merge semantics.
  - category: impacting
    description: detect-secrets gate red on factory journals (environmental) +
      MemoryError on huge tracked artifacts in dirty worktrees.
    id: TD3-I2
    resolution: secrets-baseline-exclusion lands the approved ^\.factory/ filter in
      version-correct form after schema pre-validation (journals stay
      committed); final validation runs on scoped/clean checkout and cites
      mechanism + HEAD.
  - category: adjacent
    description: "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope
      row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8
      problem-statement ADRs partly stale; design/ vs docs/adr location split."
    id: TD3-A1
    resolution: "Decision rule applied at epic-kickoff-gate from the drift list;
      defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version +
      README pin, semantic owns pipeline subsection, root owns ADR
      reconciliation via the adr-formalization item (overwrite 009/010/011 stubs
      with full ADRs, create ADR-012.md, staleness notes on 001/005/006,
      docs/adr location cross-reference). Kickoff records assignments;
      unassigned rows stay with root."
  - category: adjacent
    description: "Over-limit modules with disables, dead compat shims, duplicated
      test helpers, milestone-ID test names, hardcoded checkout paths — split by
      owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py
      (511, incl. duplicate-disable collapse); checkers owns
      tests/checkers/_factories.py (1393); semantic owns
      tests/checkers/test_semantic_check.py (506)."
    id: TD3-A2
    resolution: Each epic resolves its owned rows per audit (register() disables
      exempt per ADR-012; mixin misc per attempt-with-fallback rule); each
      removal names a survivor; blocking-debt limbs pinned or explicitly
      flagged.
adrs:
  - consequences: No model ships in iteration 3; intent's swap clause is deferred
      until a compliant model is proven. Epics build backend/cache
      infrastructure against FakeBackend + tracked cache; model wiring is a
      bounded follow-up once the verdict lands. Close-up must not claim the swap
      complete.
    context: "Iteration-2 eval returned a structural no-go: contracted accepted
      stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision
      unevaluable by construction; all 183 repo labels single-author with terse
      borderlines all True. GLiDE-0.4B also needs Fastino license review; no
      candidate is proven compliant."
    decision: "Defer model implementation to a follow-up contingent on (a)
      double-rated real brush-off sample resolving the corpus-construction
      defect and (b) human Fastino license decision if GLiDE is recommended.
      Iteration 3 delivers everything model-independent: heuristic-first
      DecisionBackend + tracked cache infrastructure, runner/checkers debloat,
      docs reconciliation."
    id: ADR-009
    title: No-go-gated semantic implementation with infrastructure-first delivery
  - consequences: Backend/cache work proceeds against pinned contracts without
      waiting for the model verdict; a compliant model plugs in via
      get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path
      surface is test-only by construction, verified by a loader test.
    context: Cache schema, key encoding, prune policy, refresh command, writer
      identity/timing, and --path scoping were designed by iteration-2 spikes
      but the pylint writer verdict (cache-design-spike input) is still pending.
      The test-only dotted-path backend import would be an
      arbitrary-code-execution surface if honored in production lint.
    decision: "Adopt iteration-2 spike contracts as authoritative unless
      contradicted at HEAD: DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1] with heuristic-first
      hard gate; tracked JSON array .python-setup-decisions.json at linted root
      (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint
      read-only with hash-asserted zero writes; explicit CI-guarded refresh
      (lockfile + merge + atomic); prune empty-files + stale-model; writer-first
      concurrency verdict from pylint-cache-assumptions (merge pending item
      first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY
      when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint
      ignores it. A loader test pins both behaviors (honored under pytest;
      ignored with the marker removed)."
    id: ADR-010
    title: Adopt iteration-2 semantic spike contracts as build baseline
  - consequences: Subsystem epics start with dispute-free ownership; no concurrent
      shared-file edits (single-writer table); AGENTS.md conflicts avoided by
      heading split + engine wave order; M3 close-out consumes a single handoff
      record gated by the M2 replan.
    context: M4 audits merged with the unified 5-owner map but report completeness
      validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split,
      shared-file edits, packaging exceptions, and the epic-to-root shift-report
      handoff need machine-checkable definitions because no cross-epic
      dependency edges exist and agents must never run git writes.
    decision: "Re-validate the unified map at iteration-3 start (counts
      67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic
      epics in one wave. Epic assignment maps setup-testing files to
      epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py +
      setup/install tests). AGENTS.md split by exact rows with engine-enforced
      wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) +
      ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic
      justification pipeline subsection only; checkers never touches AGENTS.md;
      the engine schedules the runner AGENTS.md item in an earlier wave than the
      semantic pipeline item (order recorded at kickoff); semantic verifies
      read-only via git merge-base that its base contains the runner merge when
      runner was assigned, else waits. Shared-file single-writer table (no
      concurrent edits): checkers/_base.py = semantic only (checkers puts its
      stream helper in new checkers-owned _source_stream.py, zero _base.py
      diff); no_try_import_checker.py register() disable line +
      _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line);
      test_suppression file = checkers owns all lines except the
      TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper
      exemption list = checkers, with the peek_fallback_tools line
      preconditioned on reading the runner close-up (deleted iff runner confirms
      shim deletion). Packaging exception: semantic solely owns the pyproject
      [semantic] extra block + uv.lock regeneration (single writer, enumerated
      exception to root-owned repo-root files); .gitignore untouched (legacy
      .cache lines stay; decisions file committed); no hatch entry (tracked
      cache is consumer-runtime data, not wheel payload). Shift-report handoff:
      each epic emits a shift-report section or explicit no-shift declaration in
      its close-up report; M2 replanAfter:true is the enforceable gate (the
      engine schedules no M3 item until the replan after M2 epic close-ups);
      root epic-shift-report-collection is the first post-replan item, stays
      pending unless all three close-ups exist, and consolidates the handoff
      record that golden-regen-hatch consumes."
    id: ADR-011
    title: Validated-map epic decomposition with defined AGENTS split and shift
      handoff
  - consequences: "register() disables remain as documented exemptions counted as
      exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal
      is attempt-with-fallback: either clean removal or a standardized retained
      justification, both verifiable."
    context: "Every checker register(linter: PyLinter) omits @beartype with a
      missing-beartype disable citing PyLinter runtime-unavailability / circular
      import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import;
      dropping the disable retriggers the custom missing-beartype checker.
      Separately, 4 mixin checkers suppress a SourceRootMixin.options vs
      BaseChecker.options conflict (e.g. beartype_checker.py:21) whose
      removability via a shared typed base is unproven and may be blocked by
      pylint typing."
    decision: Retain the missing-beartype disable on all register() functions with a
      standardized justification (PyLinter is a pylint internal type unavailable
      at runtime for beartype; circular import). Annotation stays PyLinter under
      TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on
      mixin classes is attempted via a shared typed base; if pylint typing
      blocks removal, retain with the standardized justification and report the
      blocker — both outcomes satisfy the epic.
    id: ADR-012
    title: register() missing-beartype exemption for PyLinter circular import


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


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered the verifiable repo scope: M1 green baseline +
  14-tool contract (check-only ruff format strategy, single-sourced registry,
  14-site docs migration, SIM102/R0914/C0208/W9704-tail fixes, baseline []) and
  M2 test-infra consolidation + golden hardening (11 helpers single-sourced,
  integration.py 498 lines, caller asserts, shared slicer, golden
  byte-identical) — both verified at HEAD by the close-up audit. M3 partial:
  model matrix + CPU eval (structural no-go with disclosed single-adjudicator
  limits) + runtime-pinning no-go skip merged; test_pylint_cache_semantics.py
  still missing (pylint-cache-assumptions running, cache-design-spike pending on
  its verdict). M4: both audits merged per engine records; report completeness
  validates at the iteration-3 replan via HEAD re-glob per ADR-008. Secrets
  verdict is human-async and does not block dev acceptance. Task intent (rule
  enforcement, debloat, semantic swap) remains iteration-3 scope per plan; no
  operator blocker."


--- Prior Close-up closeup-3.yaml ---
iteration: 3
status: next-iteration
summary: "Iteration 3 partially delivered: M1 repo scope VERIFIED
  (.secrets.baseline:41-46 ^\\.factory/ filter, test_pylint_cache_semantics.py
  485 lines/19 tests writer-first verdict, 12 ADRs with 009-012 full +
  001/005/006 staleness + README cross-ref) but M1 gate NOT closed per engine
  records (ownership-map-revalidation running, epic-kickoff-gate pending; 3
  empty waves on the single-item bottleneck). M2 ZERO DELIVERY: runner
  dispatch.py:1 still 542-line disable, baseline.py:23-42 shims retained,
  _factories_extras.py:1,6 duplicate disables, hardcoded paths + self-lint tests
  retained; checkers no _source_stream.py, _legacy_scan retained,
  trivial_wrapper exemptions retained, mixin misc unattempted, _factories.py
  1393 unsplit, single-code rule args, no SEMANTIC=0 guards; semantic zero
  DecisionBackend/cache/FakeBackend, _semantic.py still jina reranker +
  ~/.cache, _base.py:238 exact-match, [semantic] still sentence-transformers. M3
  FAILS: baseline [] holds and golden exists, but docs must-contain fails
  everywhere and no shift/regen/gate-table evidence. Gates unverifiable under
  read-only audit. Intent (rule enforcement, debloat, model swap) remains future
  scope; no operator blocker."


--- Steering Directive/Answer (1794100866341.md) ---
Operator acknowledges all plan-1 awareness items: (1) material definition and its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is intentional, not a regression. (2) git-stored cache file at the linted repo root: OK as required by INTENT; document it in install docs, keep it detect-secrets clean, and note model weight licenses. (3) never-test-linting broadening and removing the pytest self-lint guard: OK, it matches the project's coding rules; the lint gate is the guard. No further action needed on these.


--- Steering Directive/Answer (1794128584028.md) ---
Operator acknowledges awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup: restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md counts and the cli help text is approved — add it (small dev kind, depends on the v3 line) when the wave-report next amends, or fold the two-line sync into the docs-counts-sync story if it is still pending. Pre-existing red lint/test baseline items stay out of story budgets. No other action.


--- Steering Directive/Answer (1794158471467.md) ---
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.


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


--- Decision 005-item-pylint-cache-assumptions.yaml ---
id: decision-pylint-cache-assumptions-1794139485507
context: item
item: pylint-cache-assumptions
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T12:04:45.507Z
rationale: "Both develop attempts rejected solely on scope creep, not on the
  assumption tests themselves: diff leaked into M1-owned files (src
  stub/coverage.py SIM102 fix, src runner/cli.py locals, 6 tests/runner 13->14
  migrations) plus a .secrets.baseline side-effect write. The item's contract is
  one new file, tests/assumptions/test_pylint_cache_semantics.py, zero src
  changes. Reverting the out-of-scope files unblocks merge; no split/escalate
  needed."
text: "Retry granted. Fix in this order: (1) Revert to HEAD exactly:
  .secrets.baseline, src/python_setup_lint/checkers/stub/coverage.py,
  src/python_setup_lint/runner/cli.py (`git diff --` on each must be empty).
  NEVER run bare `uv run lint` or any detect-secrets scan that rewrites
  .secrets.baseline (run only `uv run pytest
  tests/assumptions/test_pylint_cache_semantics.py -q`). (2) Revert all
  tests/runner/** edits (factories, extra_tools, lint_runner, stats, t3, fakes)
  — owned by runner-format-contract, parallel race. (3) Diff must contain
  exactly ONE file: tests/assumptions/test_pylint_cache_semantics.py
  (writer-first: writer + timing + --path scoping verdict, no_external_api
  marker, test_<api>_given_<condition>_then_<expected> names, offline, no src
  imports beyond reading). (4) Verify: `git diff --stat` shows only that file;
  new tests pass; touched file ruff/format clean. Pre-existing SIM102/R0914/6
  tool-count failures persist by design — do not fix, do not baseline. Record
  the writer/timing verdict (crash-safe lock vs runner post-merge vs
  jobs=1/sidecars-if--j) plus --path sweep scope in the report for
  cache-design-spike."
persist: true


--- Decision 006-item-model-eval-poc.yaml ---
id: decision-model-eval-poc-1794148393249
context: item
item: model-eval-poc
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:33:13.249Z
rationale: "Single display bug blocks approval: report.py:250 renders Recall
  column from precision instead of meaningful_recall. Metrics, best-cell
  selection (lines 240-244), compliance table 4.4, and verdict are already
  correct, so a one-line render fix plus report.md regeneration unblocks merge;
  no split/escalate needed."
text: "Fix exactly one line in the poc folder (production paths untouched):
  report.py:250 change pct(precision and precision) to
  pct(accepted['meaningful_recall']). Regenerate report.md section 4.3 (lines
  209-215) from metrics.json. Verify displayed values: decider-nano rubric
  0.5/veto Recall 27.9% (not 3.1%), bekko rubric 37.7% (not 11.8%), ettin/minilm
  100% (not n/a). Confirm best-cell selection and compliance table 4.4 unchanged
  and verdict unaffected. Do not touch metrics computation, corpus, or selection
  logic."
persist: false


--- Decision 007-item-test-debloat-audit-i2.yaml ---
id: decision-test-debloat-audit-i2-1794158623946
context: item
item: test-debloat-audit-i2
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T17:23:43.946Z
rationale: "All 10 fix requests verified as factual regressions from r1 to r2
  (spot-checked: cli.py:292-367 has force-fix/format/cwd/config-status beyond
  MAIN_ARGPARSE_CASES; _SHIPPED_CONFIG_FILES has 11 labels; smoke test is the
  sole default full-pipeline pin). Root cause is methodological: r2 counted defs
  not collected tests, invented owner tokens, and dropped r1
  clusters/limbs/reservations. The unified-map inter-dep file exists in-repo, so
  alignment is mechanical. One guided rewrite of the report (zero repo writes)
  unblocks merge; no split/escalate needed."
text: "Retry granted. Rewrite the report (report-only, zero repo writes) fixing
  all 10 in this order: (1) Owners: restore the unified-map 5-owner scheme
  exactly (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15)
  from coding-rules-audit-i2 output.yaml:82-88; delete the 10 invented tokens;
  test_suppression file stays checkers-file with
  TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. (2) N|S
  counts: re-derive EVERY row from per-file `pytest --collect-only` truth
  (default|slow), never def counts; fix the ~25 listed files (e.g.
  semantic-check 82|3, threshold 80, lint-runner 58, stats 87). (3) Pinning:
  restore all ~15 blocking-debt limbs from r1 (cli --force-fix+env, --format,
  --cwd, --config-status; 11-label vs 7-label config gap; mypy/rumdl/ty
  _config_flag_for branches; dispatch scopes
  ty-src/pylint-pyi-src/pylint-tests-tests/tach-whole-repo; pyright tests/** and
  rumdl tests/data exclusions) — grep-verify each has zero pins. (4) Self-lint
  removals: list all six groups (noise-filter, TestModuleSizeGates,
  private-imports AST scan, autofix-conflict slow, downstream-integration
  home-write, t9_7 hardcoded checkout) with surviving gates. (5) Reservations:
  restore epic verbatim (tests/checkers/conftest.py, tests/assumptions
  runtime/decision/cache, _decision_backend/_decision_cache); delete invented
  runner/runtime paths; tests/conftest.py is root-owned. (6) Symbols: restore
  _base.py:143-238 check_if_meaningful (+pyi) and no_try_import
  _OPTIONAL_IMPORT_PATTERNS exclusions. (7) Duplicates: restore duplicate-of for
  _make_tc x13, _walk_and_release x10, _msg_ids x8, t3-vs-stats
  parser-completeness exact dup, autofix fake-vs-git, setup 6x install,
  _UvCallRecorder x2 — or explicitly justify each drop. (8) Keep
  test_real_pipeline_smoke.py (sole default full-pipeline pin; integration.py is
  explicit-only) or name a default-collected survivor. (9) Slow budget:
  recompute from truth (baseline-edge 16|2 both in TestPerfBenchmark,
  suppression 40|2) — 18->13 not 14. (10) Runtime: restore integration 65-107s
  with conditions (WSL2/py3.14.4/warm-cache ±30%). Verify: owners match unified
  map exactly; every N|S matches --collect-only; every limb/gap above named."
persist: true


--- Decision 008-item-ownership-map-revalidation.yaml ---
id: decision-ownership-map-revalidation-1794173664936
context: item
item: ownership-map-revalidation
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T21:34:24.936Z
rationale: Two factual accuracy defects block an otherwise complete revalidation
  report; both are mechanical recount/wording fixes with zero repo writes. No
  split/escalate needed.
text: "Fix exactly two report defects in the fact-finder output (zero repo
  writes, zero git writes): (1) Section 0 revision-leg delta: replace '7 first
  leg / 4 second leg' with verified `git diff --name-only` truth — first leg 4
  files, second leg 4 files, all .factory only with zero files under
  src/scripts/tests, 7 unique end-to-end (state all three numbers with the
  overlap explained). (2) Factory tracked count: recount `git ls-files .factory
  | wc -l` AT the pinned HEAD 5a6f200 (not working tree) and replace stale 615
  with the verified count (reviewer says 621 — confirm by recount, cite command
  + HEAD + count); if the count moved because HEAD advanced, re-pin to current
  HEAD short SHA and update the map-<SHA> revision ID consistently everywhere.
  Re-verify: ownership counts 67/83/15/4/15 ±5 still hold after recount; drift
  list unchanged; no other sections touched."
persist: false


--- Decision 009-nonitem.yaml ---
id: decision-nonitem-1794178741560
context: non-item
decision: fix-item
timestamp: 2026-11-08T22:59:01.560Z
rationale: "Single-item bottleneck: 3/4 schedulable M1 items merged (secrets,
  pylint-closure, adr-formalization); ownership-map-revalidation is the only
  running/schedulable item while epic-kickoff-gate and all M3 items are
  dep-blocked, so stalled validation yields empty waves with Blocked:(none).
  Original scope bundles kickoff-blocking core (counts, exclusions,
  reservations, revision) with non-blocking consumer inputs (exact stream-block
  re-pin, docs-row full validation), maximizing QA surface on a report-only
  item. Narrowing to the mergeable core unblocks kickoff; deferred inputs are
  re-pinned by consumers without loss."


## Context Pack
# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.

---

## 1. Snapshot and Gate State

| Fact | Evidence |
|---|---|
| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |

**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).

---

## 2. Module Map

### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)

| File(s) | Responsibility |
|---|---|
| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |

### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)

| File(s) | Responsibility |
|---|---|
| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |

### 2.3 Setup / testing / packaging

| File(s) | Responsibility |
|---|---|
| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |

### 2.4 Tests (`tests/`)

59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).

---

## 3. Key Interfaces & Signatures

### 3.1 Justification decision entry point — `check_if_meaningful`

`src/python_setup_lint/checkers/_base.py:142-238`:

```python
@beartype
def check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool:
```

Flow:

1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).

`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.

Call sites (all five pass a real rule/context):

- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).

### 3.2 Semantic implementation — `semantic_check_if_meaningful`

`src/python_setup_lint/checkers/_semantic.py:125-189`:

```python
@beartype
def semantic_check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool | None:
```

| Detail | Evidence |
|---|---|
| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |

### 3.3 Cache and model constants (current, to be replaced)

`_semantic.py:37-52`:

```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get(
    "PYTHON_SETUP_LINT_RERANKER_MODEL",
    "jina-reranker-v2-base-multilingual",
)
```

Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.

### 3.4 Planned backend contract from ADR-010 (absent at HEAD)

`docs/adr/ADR-010.md:23-36` fixes:

- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
- Prune missing files and stale model identifiers.
- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.

No implementation module exists at HEAD; `_semantic.py` remains the only decision path.

### 3.5 Runner interfaces relevant to a cache-refresh command

- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.

### 3.6 Checker helper / test harness interfaces

- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).

---

## 4. Relevant Excerpts and Implementation Logic

### 4.1 Current semantic pipeline is reranker-first, not heuristic-first

`_semantic.py:1-12`:

```python
# Semantic justification checker using a cross-encoder reranker (Track B).
# ...
# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
#    Re-score the justification against the rule and code context with a
#    dedicated cross-encoder for higher accuracy.
# ...
# On ImportError ... or model download failure, semantic_check_if_meaningful
# returns None, signalling the caller to fall back to the heuristic check.
```

This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.

### 4.2 `semantic_check_if_meaningful` scoring and write path

`_semantic.py:142-189` (condensed):

```python
cache_key = hashlib.sha256(
    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]

reranker = _load_reranker()
if reranker is None:
    return None
...
scores = reranker.predict([(primary, query)])
result = float(scores[0]) >= 0.5
_RESULT_CACHE[cache_key_int] = result
_save_result_cache()
return result
```

Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.

### 4.3 W9704 emission and the two decision call paths

`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
):
    return
self.add_message("unjustified-suppression", ...)
```

`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).

### 4.4 Cache writer verdict that any redesign must consume

`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:

- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.

The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).

### 4.5 ADR-010 conflicts with the current tests

`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.

### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)

`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:

- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).

So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.

### 4.7 Existing sorted-JSON/atomic-write patterns

- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.

---

## 5. Existing Tests and Conventions

### 5.1 Test layers and commands

| Layer | Command | Scope / evidence |
|---|---|---|
| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |

### 5.2 Checker test conventions

- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.

### 5.3 Golden behavior-preservation contract

`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).

Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).

### 5.4 Semantic test inventory and redundancy

| File | Lines / roles | Redundancy / impact |
|---|---|---|
| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |

### 5.5 Existing debloat evidence (objective)

| Category | Evidence |
|---|---|
| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |

### 5.6 Third-party assumptions to read before debloating

- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.

---

## 6. Model Candidate Landscape (external; verify before adoption)

The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.

| Candidate | Params | License | Runtime / CPU evidence | Notes |
|---|---:|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |

Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.

Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).

---

## 7. Open Questions and Uncertainties

1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?

2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.

3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).

4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.

5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.

6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).

7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?

8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?

9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.

10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).

11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.

12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.

13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.

14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.

---

## 8. Recommendations for the Architect

1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.

2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.

3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.

4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.

5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.

6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.

7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.

## Task Status
iteration: 4
amendments: 0
items:
  - baseline-diff-merge kind=test-only wave=1 status=merged outlineRef=baseline-diff-merge
  - semantic-threshold-consolidation kind=test-only wave=1 status=merged outlineRef=semantic-threshold-consolidation
  - decision-cache-design-spike kind=poc wave=1 status=merged outlineRef=decision-cache-design-spike
  - checkers-semantic-guards kind=test-only wave=1 status=merged outlineRef=checkers-semantic-guards
  - runner-compat-shim-removal kind=no-behavior wave=2 status=merged outlineRef=runner-compat-shim-removal
  - decision-backend-impl kind=dev wave=2 status=merged outlineRef=decision-backend-impl
  - checkers-stream-helper kind=no-behavior wave=2 status=running outlineRef=checkers-stream-helper
  - checkers-factories-split kind=test-only wave=2 status=merged outlineRef=checkers-factories-split
  - runner-dispatch-split kind=no-behavior wave=3 status=merged outlineRef=runner-dispatch-split
  - checkers-legacy-dead-cleanup kind=no-behavior wave=3 status=pending outlineRef=checkers-legacy-dead-cleanup
  - runner-factories-trim kind=test-only wave=3 status=merged outlineRef=runner-factories-trim
  - stale-disables-portability-cleanup kind=test-only wave=3 status=merged outlineRef=stale-disables-portability-cleanup
  - decision-cache-impl kind=dev wave=4 status=pending outlineRef=decision-cache-impl
  - never-test-linting-prune kind=test-only wave=4 status=pending outlineRef=never-test-linting-prune
  - semantic-tests-rewrite kind=test-only wave=5 status=pending outlineRef=semantic-tests-rewrite
  - docs-reconciliation kind=no-behavior wave=6 status=pending outlineRef=docs-reconciliation
waves: 1, 2, 3, 4, 5, 6
merged: baseline-diff-merge, semantic-threshold-consolidation, decision-cache-design-spike, checkers-semantic-guards, runner-compat-shim-removal, decision-backend-impl, checkers-factories-split, runner-dispatch-split, runner-factories-trim, stale-disables-portability-cleanup
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
